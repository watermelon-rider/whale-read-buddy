/**
 * Mermaid 围栏渲染：引擎 ~500KB，首次用到时才异步加载。
 * 渲染失败降级为原始代码块，绝不破坏会话内容。
 */
import { useEffect, useRef, useState } from 'react';

let mermaidPromise: Promise<typeof import('mermaid').default> | null = null;

function loadMermaid() {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid').then((m) => {
      m.default.initialize({ startOnLoad: false, theme: 'neutral', securityLevel: 'strict' });
      return m.default;
    });
  }
  return mermaidPromise;
}

let seq = 0;

export function Mermaid({ code }: { code: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void loadMermaid()
      .then((m) => m.render(`dr-mmd-${seq++}`, code))
      .then(({ svg }) => {
        if (!cancelled && ref.current) ref.current.innerHTML = svg;
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
  return <div className="dr-mermaid" ref={ref} />;
}
