/**
 * 渲染内容的工具条：悬浮出现 [复制] [投到浏览器窗口]。
 * 投放：内容序列化为 HTML 经 storage.session 传到 viewer.html 新标签页（整窗口查看）。
 */
import { useState, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Check, Copy, ExternalLink, LineChart } from 'lucide-react';
import { t } from '../../../i18n';

interface Props {
  children: ReactNode;
  label?: string;
  /** 提供时出现复制按钮（复制源文本，如 mermaid/LaTeX 源码）。 */
  copyText?: string;
  /** 提供时出现「函数图像」按钮：把公式源码投到查看器的 plot 模式。 */
  plotTex?: string;
}

export function Zoomable({ children, label, copyText, plotTex }: Props) {
  const [copied, setCopied] = useState(false);

  const openInWindow = async () => {
    const html = renderToStaticMarkup(<div className="dr-md">{children}</div>);
    const key = `viewer:${crypto.randomUUID()}`;
    await chrome.storage.session.set({ [key]: html });
    await chrome.tabs.create({ url: chrome.runtime.getURL(`viewer.html?key=${key}`) });
  };

  const openPlot = async () => {
    if (!plotTex) return;
    const key = `plot:${crypto.randomUUID()}`;
    await chrome.storage.session.set({ [key]: plotTex });
    await chrome.tabs.create({
      url: chrome.runtime.getURL(`viewer.html?mode=plot&key=${key}`),
    });
  };

  return (
    <div className="dr-zoomable">
      <div className="dr-zoom-tools">
        {plotTex !== undefined && (
          <button className="dr-zoom-btn" title={t('plotFunction')} onClick={() => void openPlot()}>
            <LineChart size={13} strokeWidth={2} />
          </button>
        )}
        {copyText !== undefined && (
          <button
            className="dr-zoom-btn"
            title={t('copySource')}
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
          title={label ?? t('openInWindow')}
          onClick={() => void openInWindow()}
        >
          <ExternalLink size={13} strokeWidth={2} />
        </button>
      </div>
      {children}
    </div>
  );
}
