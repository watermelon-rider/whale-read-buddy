/**
 * Content script 入口：页面正文提取（Defuddle）+ 页面划词批注 + 草稿高亮渲染。
 * UI 注入用 Shadow DOM 隔离页面 CSS。
 */
import { defineContentScript } from 'wxt/utils/define-content-script';
import Defuddle from 'defuddle';
import { mountAnnotationFlow } from '../content/annotate';
import { renderHighlights } from '../content/highlight';
import type { AnnotationItem } from '../types';

export default defineContentScript({
  matches: ['http://*/*', 'https://*/*'],
  runAt: 'document_idle',
  main() {
    // 扩展重载/重复注入时旧实例的监听器已死但 UI 残留：
    // 新实例挂载前清掉新旧各代的 UI（含无 id 的旧版宿主），保证只有一份。
    document
      .querySelectorAll(
        // 兼容清理新旧各代宿主 id。
        '#whalereader-annotate-host, #deepreader-annotate-host, #deepreader-annotate-toolbar',
      )
      .forEach((n) => n.remove());
    // 无 id 的中间代孤儿宿主：按内联样式特征（我们专属的超高 z-index）识别。
    document
      .querySelectorAll(
        'div[style*="2147483647"]:not(#whalereader-annotate-host):not(#deepreader-annotate-host)',
      )
      .forEach((n) => n.remove());
    renderHighlights([]); // 全量清空（空列表 = 只清理不绘制）

    let latestAnnotations: AnnotationItem[] = [];

    chrome.runtime.onMessage.addListener((raw, _sender, sendResponse) => {
      const req = raw as
        | { kind: 'extractPage' }
        | { kind: 'syncHighlights'; annotations: AnnotationItem[] };
      if (req.kind === 'extractPage') {
        try {
          const result = new Defuddle(document, { markdown: true }).parse();
          sendResponse({
            title: result.title || document.title,
            markdown: result.content ?? '',
          });
        } catch (err) {
          sendResponse({ error: String(err) });
        }
        return false;
      }
      if (req.kind === 'syncHighlights') {
        latestAnnotations = req.annotations;
        renderHighlights(req.annotations);
        return false;
      }
      return false;
    });

    // 页面划词 → 原地编辑卡片 → 上报 background（写入草稿并同步全端）。
    mountAnnotationFlow({
      onAdd: (quote, note, anchor) => {
        void chrome.runtime.sendMessage({ kind: 'pageSelected', quote, note, anchor });
      },
      onUpdate: (quote, note) => {
        void chrome.runtime.sendMessage({ kind: 'pageAnnotationUpdated', quote, note });
      },
      onRemove: (quote) => {
        void chrome.runtime.sendMessage({ kind: 'pageAnnotationRemoved', quote });
      },
      getNote: (quote) => latestAnnotations.find((a) => a.quote === quote)?.note ?? '',
    });
  },
});
