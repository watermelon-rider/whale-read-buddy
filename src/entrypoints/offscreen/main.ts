/**
 * Offscreen document：在页面 context 里运行 pdf.js（service worker 不适合跑 worker 重活）。
 * 接收 background 发来的 base64 PDF 字节，返回文本层。
 */
import { extractPdfText } from '../../core/extract/pdf';
// Vite/WXT 会把 worker 打包为扩展资源并返回其 URL。
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

chrome.runtime.onMessage.addListener((raw, _sender, sendResponse) => {
  const req = raw as { kind: string; dataBase64?: string };
  if (req.kind !== 'extractPdf' || typeof req.dataBase64 !== 'string') return false;
  extractPdfText(base64ToArrayBuffer(req.dataBase64), workerUrl)
    .then((text) => sendResponse({ text }))
    .catch((err) => sendResponse({ error: String(err) }));
  return true;
});
