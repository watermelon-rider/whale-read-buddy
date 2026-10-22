/**
 * 单条消息气泡：
 * - 用户消息：协议块隐藏，只显示提问 + 批注 chip（hover 查看）。
 * - 助手消息：Markdown 渲染；reasoning 折叠；Annotation N： 渲染为 hoverable chip。
 */
import { Children, isValidElement, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Check, Copy, MessageSquareQuote } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import 'katex/dist/katex.min.css';
import type { AnnotationItem } from '../../types';
import { REPLY_ANNOTATION_RE, splitAnnotationProtocol } from '../../core/annotation/protocol';
import { AnnoPopover } from '../shared/AnnoPopover';
import { CalloutBlockquote, SortableTable, Steps, Timeline } from './markdown/blocks';
import { Mermaid } from './markdown/Mermaid';
import { MathBlock, MathInline } from './markdown/Math';
import { t } from '../../i18n';

interface AnnoDetail {
  anno: AnnotationItem;
  rect: DOMRect;
}

function AnnotationChips({
  annotations,
  onShowDetail,
}: {
  annotations: AnnotationItem[];
  onShowDetail: (d: AnnoDetail) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);
  // 弹出方向自适应：上方空间不足时向下弹，避免被面板顶部遮挡。
  const [popDown, setPopDown] = useState(false);

  const toggleOpen = () => {
    if (!open && rootRef.current) {
      const rect = rootRef.current.getBoundingClientRect();
      // 浮层最大高约 250px（含间距），上方不够就向下。
      setPopDown(rect.top < 260);
    }
    setOpen((v) => !v);
  };

  // 失焦/点击外部/Esc 自动关闭列表浮层。
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('blur', onClose2);
    function onClose2() {
      setOpen(false);
    }
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('blur', onClose2);
    };
  }, [open]);

  return (
    <span className="dr-anno-chips" ref={rootRef}>
      <button className="dr-chip dr-chip-bordered" onClick={toggleOpen}>
        <MessageSquareQuote size={13} strokeWidth={1.8} />
        {t('annotationsChip', { n: annotations.length })}
      </button>
      {open && (
        <div className={`dr-anno-pop${popDown ? ' dr-anno-pop-down' : ''}`}>
          {annotations.map((a) => (
            <button
              key={a.index}
              className="dr-anno-pop-item dr-anno-pop-btn"
              onClick={(e) =>
                onShowDetail({ anno: a, rect: e.currentTarget.getBoundingClientRect() })
              }
            >
              <div className="dr-anno-quote">
                #{a.index} 「{a.quote}」
              </div>
              {a.note && <div className="dr-anno-note">{t('notePrefix', { note: a.note })}</div>}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}

/**
 * 助手文本渲染：在 Markdown 文本节点内部把「Annotation N：」替换为 hoverable chip。
 * 不按标签切开分段渲染（会把跨段的 **加粗** 等配对切断）。
 * 另外：CommonMark 规定 closing ** 紧跟 CJK 字符时不闭合（ micromark 无 CJK 扩展），
 * 因此在文本节点里手动处理 ** 配对加粗。
 */
export function AssistantContent({
  content,
  replyAnnotations,
  onShowDetail = () => {},
  streaming = false,
}: {
  content: string;
  replyAnnotations?: AnnotationItem[];
  onShowDetail?: (d: AnnoDetail) => void;
  /** 流式进行中：mermaid 等块延后到流结束再渲染（半成品代码解析会报错刷屏）。 */
  streaming?: boolean;
}) {
  const components = useMemo(() => {
    /** 文本片段内的 Annotation chip 替换。 */
    const annoChips = (text: string, keyPrefix: string): ReactNode[] => {
      if (!replyAnnotations || !/Annotation\s+\d+\s*[：:]/.test(text)) return [text];
      const parts: ReactNode[] = [];
      let last = 0;
      let key = 0;
      for (const match of text.matchAll(REPLY_ANNOTATION_RE)) {
        const at = match.index;
        if (at > last) parts.push(text.slice(last, at));
        const anno = replyAnnotations.find((a) => a.index === Number(match[1]));
        parts.push(
          <button
            key={`${keyPrefix}-${key++}`}
            className="dr-chip dr-reply-anno"
            onClick={(e) => {
              if (anno) onShowDetail({ anno, rect: e.currentTarget.getBoundingClientRect() });
            }}
          >
            Annotation {match[1]}：
          </button>,
        );
        last = at + match[0].length;
      }
      if (last < text.length) parts.push(text.slice(last));
      return parts;
    };

    /** 手动处理 **加粗** 配对（CJK 相邻时 micromark 不闭合），段内再做 chip 替换。 */
    const renderText = (text: string, keyPrefix: string): ReactNode[] => {
      if (!text.includes('**')) return annoChips(text, keyPrefix);
      const segments = text.split('**');
      const out: ReactNode[] = [];
      segments.forEach((seg, i) => {
        const isLast = i === segments.length - 1;
        if (i % 2 === 1 && !isLast) {
          out.push(<strong key={`${keyPrefix}-b${i}`}>{annoChips(seg, `${keyPrefix}-b${i}`)}</strong>);
        } else {
          // 未配对的落回普通文本（补还原 ** 分隔符）。
          const literal = i % 2 === 1 ? `**${seg}` : seg;
          if (literal) out.push(...annoChips(literal, `${keyPrefix}-t${i}`));
        }
      });
      return out;
    };

    const withChips = (children: ReactNode): ReactNode =>
      Children.map(children, (child) => {
        if (typeof child !== 'string') return child;
        const rendered = renderText(child, 'x');
        return rendered.length === 1 ? rendered[0] : rendered;
      });

    const wrap = (Tag: 'p' | 'li' | 'strong' | 'em' | 'td' | 'th' | 'h1' | 'h2' | 'h3') => {
      const C = ({ children }: { children?: ReactNode }) => <Tag>{withChips(children)}</Tag>;
      return C;
    };

    return {
      p: wrap('p'),
      li: wrap('li'),
      strong: wrap('strong'),
      em: wrap('em'),
      td: wrap('td'),
      th: wrap('th'),
      h1: wrap('h1'),
      h2: wrap('h2'),
      h3: wrap('h3'),
      blockquote: CalloutBlockquote,
      table: SortableTable,
      pre: (props: { children?: ReactNode }) => <PreBlock {...props} streaming={streaming} />,
      code: CodeInline,
    };
  }, [replyAnnotations, onShowDetail, streaming]);

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      components={components}
    >
      {content}
    </ReactMarkdown>
  );
}

/** code 覆写：行内公式（math-inline）走 KaTeX，其余保持默认。 */
function CodeInline({ className, children }: { className?: string; children?: ReactNode }) {
  if (className?.includes('math-inline')) {
    return <MathInline tex={textOf(children)} />;
  }
  return <code className={className}>{children}</code>;
}

/** pre 覆写：mermaid / steps / timeline / 块级公式走自定义渲染，其余保持默认。 */
function PreBlock({ children, streaming }: { children?: ReactNode; streaming?: boolean }) {
  const child = Children.toArray(children)[0];
  if (isValidElement(child)) {
    const props = child.props as { className?: string; children?: ReactNode };
    const lang = props.className?.match(/language-(\w+)/)?.[1];
    const code = textOf(props.children);
    if (props.className?.includes('math-display')) return <MathBlock tex={code} />;
    if (lang === 'mermaid') {
      // 流式中途的半成品围栏不送解析（会报几十个语法错误），显示占位。
      if (streaming) return <div className="dr-mermaid-pending">{t('mermaidPending')}</div>;
      return <Mermaid code={code} />;
    }
    if (lang === 'steps') return <Steps code={code} />;
    if (lang === 'timeline') return <Timeline code={code} />;
  }
  return <pre>{children}</pre>;
}

function textOf(node: ReactNode): string {
  return Children.toArray(node)
    .map((c) => (typeof c === 'string' ? c : ''))
    .join('');
}

export interface DisplayMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  reasoning?: string;
  /** 思维链耗时（毫秒）。 */
  reasoningMs?: number;
  /** 流式进行中的气泡。 */
  streaming?: boolean;
  annotations?: AnnotationItem[];
  /** 最近一次携带批注的用户消息（供回复 chip 查找原文）。 */
  replyAnnotations?: AnnotationItem[];
  interrupted?: boolean;
  /** 事件时间戳（毫秒）。 */
  at?: number;
}

function formatTime(at: number): string {
  const d = new Date(at);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const hm = d.toTimeString().slice(0, 5);
  return sameDay ? hm : `${d.getMonth() + 1}/${d.getDate()} ${hm}`;
}

/** 悬浮显示的元信息行：时间 + 复制。 */
function HoverMeta({ message }: { message: DisplayMessage }) {
  const [copied, setCopied] = useState(false);
  if (message.streaming || message.at === undefined) return null;
  const copyText =
    message.role === 'user' ? splitAnnotationProtocol(message.text).question : message.text;
  return (
    <div className="dr-msg-meta">
      <span className="dr-msg-time">{formatTime(message.at)}</span>
      <button
        className="dr-icon-btn dr-copy-btn"
        title={t('copy')}
        onClick={() => {
          void navigator.clipboard.writeText(copyText).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          });
        }}
      >
        {copied ? <Check size={13} strokeWidth={2} /> : <Copy size={13} strokeWidth={1.8} />}
      </button>
    </div>
  );
}

/** 思维链实况：单行字幕，永远只显示最后一行（旧行上推隐去，无滚动条）。 */
function ThinkingLive({ text }: { text: string }) {
  const lastLine = text.replace(/\s+$/, '').split('\n').pop() ?? '';
  return (
    <div className="dr-thinking-live">
      <span key={lastLine} className="dr-thinking-line">
        {lastLine}
      </span>
    </div>
  );
}

export function MessageBubble({
  message,
}: {
  message: DisplayMessage;
}) {
  const [detail, setDetail] = useState<AnnoDetail | null>(null);

  if (message.role === 'user') {
    const { question } = splitAnnotationProtocol(message.text);
    return (
      <div className="dr-msg dr-msg-user">
        <div className="dr-bubble">
          {question.trim().length > 0 ? (
            <span className="dr-plain">{question}</span>
          ) : (
            <span className="dr-plain dr-dim">{t('onlyAnnotations')}</span>
          )}
          {message.annotations && message.annotations.length > 0 && (
            <AnnotationChips annotations={message.annotations} onShowDetail={setDetail} />
          )}
        </div>
        <HoverMeta message={message} />
        {detail && (
          <AnnoPopover
            rect={detail.rect}
            quote={detail.anno.quote}
            note={detail.anno.note}
            onClose={() => setDetail(null)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="dr-msg dr-msg-assistant">
      {/* 思维链滚动实况：正文出现即逝 */}
      {message.streaming && message.reasoning && message.text.length === 0 && (
        <ThinkingLive text={message.reasoning} />
      )}
      {/* 思考结束后只留下耗时 */}
      {message.reasoningMs !== undefined && (
        <div className="dr-thought-line">
          {t('thoughtSeconds', { s: (message.reasoningMs / 1000).toFixed(1) })}
        </div>
      )}
      <div className="dr-md">
        <AssistantContent
          content={message.text}
          replyAnnotations={message.replyAnnotations}
          onShowDetail={setDetail}
          streaming={message.streaming}
        />
      </div>
      {message.interrupted && <div className="dr-interrupted">{t('interrupted')}</div>}
      <HoverMeta message={message} />
      {detail && (
        <AnnoPopover
          rect={detail.rect}
          quote={detail.anno.quote}
          note={detail.anno.note}
          onClose={() => setDetail(null)}
        />
      )}
    </div>
  );
}
