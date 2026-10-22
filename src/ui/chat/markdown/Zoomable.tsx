/**
 * 渲染内容的工具条：悬浮出现 [复制] [投到浏览器窗口]。
 * 投放：内容序列化为 HTML 经 storage.session 传到 viewer.html 新标签页（整窗口查看）。
 */
import { useState, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Check, Copy, ExternalLink } from 'lucide-react';

interface Props {
  children: ReactNode;
  label?: string;
  /** 提供时出现复制按钮（复制源文本，如 mermaid/LaTeX 源码）。 */
  copyText?: string;
}

export function Zoomable({ children, label, copyText }: Props) {
  const [copied, setCopied] = useState(false);

  const openInWindow = async () => {
    const html = renderToStaticMarkup(<div className="dr-md">{children}</div>);
    const key = `viewer:${crypto.randomUUID()}`;
    await chrome.storage.session.set({ [key]: html });
    await chrome.tabs.create({ url: chrome.runtime.getURL(`viewer.html?key=${key}`) });
  };

  return (
    <div className="dr-zoomable">
      <div className="dr-zoom-tools">
        {copyText !== undefined && (
          <button
            className="dr-zoom-btn"
            title="复制源文本"
            onClick={() => {
              void navigator.clipboard.writeText(copyText).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1200);
              });
            }}
          >
            {copied ? <Check size={13} strokeWidth={2} /> : <Copy size={13} strokeWidth={2} />}
          </button>
        )}
        <button
          className="dr-zoom-btn"
          title={label ?? '投到浏览器窗口查看'}
          onClick={() => void openInWindow()}
        >
          <ExternalLink size={13} strokeWidth={2} />
        </button>
      </div>
      {children}
    </div>
  );
}
