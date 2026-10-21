/**
 * PDF 文本层提取（方案 C：background fetch 原始字节 + pdf.js 解析）。
 * 仅提取文本；扫描版 PDF（无文字层）会得到接近空的文本，由调用方提示。
 */
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';

let workerReady = false;

/** 配置 pdf.js worker（扩展打包后 worker 为本地资源路径）。 */
function ensureWorker(workerSrc: string): void {
  if (workerReady) return;
  GlobalWorkerOptions.workerSrc = workerSrc;
  workerReady = true;
}

/**
 * 从 PDF 字节提取全部文本。
 * @param workerSrc pdf.worker 的 URL（调用方用 chrome.runtime.getURL 提供）。
 */
export async function extractPdfText(data: ArrayBuffer, workerSrc: string): Promise<string> {
  ensureWorker(workerSrc);
  const doc = await getDocument({ data }).promise;
  const parts: string[] = [];
  try {
    for (let pageNo = 1; pageNo <= doc.numPages; pageNo++) {
      const page = await doc.getPage(pageNo);
      const content = await page.getTextContent();
      const text = content.items
        .map((item) => ('str' in item ? item.str : ''))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (text.length > 0) parts.push(`【第 ${pageNo} 页】\n${text}`);
    }
  } finally {
    await doc.destroy();
  }
  return parts.join('\n\n');
}
