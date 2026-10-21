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
