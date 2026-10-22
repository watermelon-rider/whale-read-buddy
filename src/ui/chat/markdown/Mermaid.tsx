/**
 * Mermaid 围栏渲染：引擎 ~500KB，首次用到时才异步加载。
 * 渲染失败降级为原始代码块，绝不破坏会话内容。
 */
import { useEffect, useState } from 'react';
import { Zoomable } from './Zoomable';

let mermaidPromise: Promise<typeof import('mermaid').default> | null = null;

function loadMermaid() {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid').then((m) => {
      // loose：允许标签里的 <br/> 等 HTML（内容来自本地模型输出，风险可控）。
      m.default.initialize({ startOnLoad: false, theme: 'neutral', securityLevel: 'loose' });
      return m.default;
    });
  }
  return mermaidPromise;
}

/** 模型常在 mermaid 标签里写 HTML 实体（&lt; 等），先解码再渲染。 */
function decodeEntities(code: string): string {
  return code
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

let seq = 0;

export function Mermaid({ code }: { code: string }) {
  const [svg, setSvg] = useState('');
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void loadMermaid()
      .then((m) => m.render(`dr-mmd-${seq++}`, decodeEntities(code)))
      .then(({ svg }) => {
        if (!cancelled) setSvg(svg);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [code]);

  if (error) {
    return (
      <pre>
        <code>{code}</code>
      </pre>
    );
  }
  return (
    <Zoomable label="放大流程图">
      <div className="dr-mermaid" dangerouslySetInnerHTML={{ __html: svg }} />
    </Zoomable>
  );
}
