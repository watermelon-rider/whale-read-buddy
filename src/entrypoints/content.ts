/**
 * Content script 入口：页面正文提取（Defuddle）+ 页面划词捕获。
 * UI 注入用 Shadow DOM 隔离页面 CSS。
 */
import { defineContentScript } from 'wxt/utils/define-content-script';
import Defuddle from 'defuddle';
import { mountAnnotationToolbar } from '../content/annotate';
import { restoreHighlights } from '../content/highlight';
import type { AnnotationItem } from '../types';

export default defineContentScript({
  matches: ['http://*/*', 'https://*/*'],
  runAt: 'document_idle',
  main() {
    chrome.runtime.onMessage.addListener((raw, _sender, sendResponse) => {
      const req = raw as
        | { kind: 'extractPage' }
        | { kind: 'restoreHighlights'; annotations: AnnotationItem[] };
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
      if (req.kind === 'restoreHighlights') {
        restoreHighlights(req.annotations);
        return false;
      }
      return false;
    });

    // 页面划词 → 「批注」工具条 → 上报 background（转发 side panel）。
    mountAnnotationToolbar((quote) => {
      void chrome.runtime.sendMessage({ kind: 'pageSelected', quote });
    });
  },
});
