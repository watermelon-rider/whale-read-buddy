/**
 * 单条消息气泡：
 * - 用户消息：协议块隐藏，只显示提问 + 批注 chip（hover 查看）。
 * - 助手消息：Markdown 渲染；reasoning 折叠；Annotation N： 渲染为 hoverable chip。
 */
import { Children, useMemo, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight, MessageSquareQuote } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { AnnotationItem } from '../../types';
import { REPLY_ANNOTATION_RE, splitAnnotationProtocol } from '../../core/annotation/protocol';
import { redactReasoning } from '../../core/prompt/redact';

function AnnotationChips({ annotations }: { annotations: AnnotationItem[] }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="dr-anno-chips">
      <button className="dr-chip" onClick={() => setOpen((v) => !v)}>
        <MessageSquareQuote size={13} strokeWidth={1.8} />
        批注 ×{annotations.length}
      </button>
      {open && (
        <div className="dr-anno-pop">
          {annotations.map((a) => (
            <div key={a.index} className="dr-anno-pop-item">
              <div className="dr-anno-quote">
                #{a.index} 「{a.quote}」
              </div>
              {a.note && <div className="dr-anno-note">批注：{a.note}</div>}
            </div>
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
}: {
  content: string;
  replyAnnotations?: AnnotationItem[];
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
          <span
            key={`${keyPrefix}-${key++}`}
            className="dr-chip dr-reply-anno"
            title={anno ? `「${anno.quote}」\n批注：${anno.note || '（无）'}` : undefined}
          >
            Annotation {match[1]}：
          </span>,
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
    };
  }, [replyAnnotations]);

  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {content}
    </ReactMarkdown>
  );
}

export interface DisplayMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  reasoning?: string;
  annotations?: AnnotationItem[];
  /** 最近一次携带批注的用户消息（供回复 chip 查找原文）。 */
  replyAnnotations?: AnnotationItem[];
  interrupted?: boolean;
}

export function MessageBubble({
  message,
  redactSources = [],
}: {
  message: DisplayMessage;
  /** 思维链脱敏源：人设/提示词原文。 */
  redactSources?: string[];
}) {
  const [showReasoning, setShowReasoning] = useState(false);
  const reasoningText = useMemo(
    () => (message.reasoning ? redactReasoning(message.reasoning, redactSources) : undefined),
    [message.reasoning, redactSources],
  );

  if (message.role === 'user') {
    const { question } = splitAnnotationProtocol(message.text);
    return (
      <div className="dr-msg dr-msg-user">
        <div className="dr-bubble">
          {question.trim().length > 0 ? (
            <span className="dr-plain">{question}</span>
          ) : (
            <span className="dr-plain dr-dim">（仅发送批注）</span>
          )}
          {message.annotations && message.annotations.length > 0 && (
            <AnnotationChips annotations={message.annotations} />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="dr-msg dr-msg-assistant">
      {reasoningText && (
        <div className="dr-reasoning">
          <button className="dr-reasoning-toggle" onClick={() => setShowReasoning((v) => !v)}>
            {showReasoning ? (
              <ChevronDown size={13} strokeWidth={1.8} />
            ) : (
              <ChevronRight size={13} strokeWidth={1.8} />
            )}
            大肥鱼的脑回路
          </button>
          {showReasoning && <div className="dr-reasoning-body">{reasoningText}</div>}
        </div>
      )}
      <div className="dr-md">
        <AssistantContent content={message.text} replyAnnotations={message.replyAnnotations} />
      </div>
      {message.interrupted && <div className="dr-interrupted">（已中断）</div>}
    </div>
  );
}
