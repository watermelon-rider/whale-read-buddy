/**
 * 自定义围栏与容器渲染：steps 步骤条、timeline 时间线、callout 提示卡（GitHub alert 语法）、
 * 可排序表格。
 */
import { Children, isValidElement, useEffect, useRef, type ReactNode } from 'react';
import { AlertTriangle, Info, Lightbulb } from 'lucide-react';
import { Zoomable } from './Zoomable';

/** 从 children 中提取第一个字符串文本（递归）。 */
function firstText(children: ReactNode): string {
  for (const child of Children.toArray(children)) {
    if (typeof child === 'string' && child.length > 0) return child;
    if (isValidElement(child)) {
      const t = firstText((child.props as { children?: ReactNode }).children);
      if (t) return t;
    }
  }
  return '';
}

/** 从 children 里剥掉首个字符串开头的 `[!XXX]` 标记（只剥一次）。 */
function stripMarker(children: ReactNode): ReactNode {
  let stripped = false;
  const walk = (node: ReactNode): ReactNode =>
    Children.map(node, (child) => {
      if (stripped) return child;
      if (typeof child === 'string') {
        const m = child.match(/^\s*\[!(NOTE|TIP|WARNING|IMPORTANT|CAUTION)\]\s*/i);
        if (m) {
          stripped = true;
          return child.slice(m[0].length);
        }
        return child;
      }
      if (isValidElement(child)) {
        const props = child.props as Record<string, unknown>;
        return {
          ...child,
          props: { ...props, children: walk(props.children as ReactNode) },
        } as typeof child;
      }
      return child;
    });
  return walk(children);
}

const CALLOUT_VARIANTS: Record<string, { icon: typeof Info; label: string; cls: string }> = {
  NOTE: { icon: Info, label: '注意', cls: 'note' },
  TIP: { icon: Lightbulb, label: '提示', cls: 'tip' },
  IMPORTANT: { icon: Info, label: '重要', cls: 'important' },
  WARNING: { icon: AlertTriangle, label: '警告', cls: 'warning' },
  CAUTION: { icon: AlertTriangle, label: '小心', cls: 'warning' },
};

/** blockquote 覆写：GitHub alert 语法（> [!NOTE] …）渲染为提示卡，否则普通引用。 */
export function CalloutBlockquote({ children }: { children?: ReactNode }) {
  const first = firstText(children);
  const m = first.match(/^\s*\[!(\w+)\]/);
  if (!m) return <blockquote>{children}</blockquote>;
  const variant = CALLOUT_VARIANTS[m[1]!.toUpperCase()] ?? CALLOUT_VARIANTS.NOTE!;
  const Icon = variant.icon;
  return (
    <div className={`dr-callout dr-callout-${variant.cls}`}>
      <div className="dr-callout-head">
        <Icon size={14} strokeWidth={2} />
        {variant.label}
      </div>
      <div className="dr-callout-body">{stripMarker(children)}</div>
    </div>
  );
}

/** ```steps 围栏：每行「标题 | 描述」渲染为编号步骤条。 */
export function Steps({ code }: { code: string }) {
  const rows = code.trim().split('\n').filter((l) => l.trim().length > 0);
  return (
    <Zoomable label="投到浏览器窗口查看" copyText={code}>
      <div className="dr-steps">
      {rows.map((row, i) => {
        const [title, ...rest] = row.split('|');
        return (
          <div key={i} className="dr-step">
            <div className="dr-step-num">{i + 1}</div>
            <div className="dr-step-body">
              <div className="dr-step-title">{title?.trim()}</div>
              {rest.length > 0 && <div className="dr-step-desc">{rest.join('|').trim()}</div>}
            </div>
          </div>
        );
      })}
      </div>
    </Zoomable>
  );
}

/** ```timeline 围栏：每行「时间 | 事件」渲染为竖线时间轴。 */
export function Timeline({ code }: { code: string }) {
  const rows = code.trim().split('\n').filter((l) => l.trim().length > 0);
  return (
    <Zoomable label="投到浏览器窗口查看" copyText={code}>
      <div className="dr-timeline">
        {rows.map((row, i) => {
          const [time, ...rest] = row.split('|');
          return (
            <div key={i} className="dr-timeline-item">
              <div className="dr-timeline-dot" />
              <div className="dr-timeline-time">{time?.trim()}</div>
              <div className="dr-timeline-text">{rest.join('|').trim()}</div>
            </div>
          );
        })}
      </div>
    </Zoomable>
  );
}

/** 可排序表格：点表头循环 升序 → 降序 → 还原；数字感知（千分位/百分比/小数）。 */
export function SortableTable({ children }: { children?: ReactNode }) {
  const ref = useRef<HTMLTableElement>(null);
  const originalOrder = useRef<Map<HTMLTableRowElement, number>>(new Map());

  useEffect(() => {
    const table = ref.current;
    if (!table) return;
    const tbody = table.tBodies[0];
    if (!tbody) return;
    originalOrder.current = new Map([...tbody.rows].map((r, i) => [r, i]));

    const compare = (a: string, b: string): number => {
      const num = (s: string) => Number(s.replace(/[,万亿%\s]/g, ''));
      const na = num(a);
      const nb = num(b);
      if (!Number.isNaN(na) && !Number.isNaN(nb) && a.trim() !== '' && b.trim() !== '') {
        return na - nb;
      }
      return a.localeCompare(b, 'zh-CN');
    };

    const handlers: Array<[HTMLTableCellElement, () => void]> = [];
    [...table.tHead?.rows[0]?.cells ?? []].forEach((th, col) => {
      let state: 0 | 1 | 2 = 0;
      th.classList.add('dr-th-sortable');
      const onClick = () => {
        state = ((state + 1) % 3) as 0 | 1 | 2;
        const rows = [...tbody.rows];
        if (state === 0) {
          rows.sort((a, b) => (originalOrder.current.get(a) ?? 0) - (originalOrder.current.get(b) ?? 0));
        } else {
          rows.sort((a, b) => {
            const av = a.cells[col]?.textContent ?? '';
            const bv = b.cells[col]?.textContent ?? '';
            return state === 1 ? compare(av, bv) : compare(bv, av);
          });
        }
        rows.forEach((r) => tbody.appendChild(r));
      };
      th.addEventListener('click', onClick);
      handlers.push([th, onClick]);
    });
    return () => handlers.forEach(([th, fn]) => th.removeEventListener('click', fn));
  }, [children]);

  return (
    <Zoomable label="投到浏览器窗口查看">
      <table ref={ref}>{children}</table>
    </Zoomable>
  );
}
