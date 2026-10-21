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
 */
function AssistantContent({
  content,
  replyAnnotations,
}: {
  content: string;
  replyAnnotations?: AnnotationItem[];
}) {
  const components = useMemo(() => {
    const withChips = (children: ReactNode): ReactNode =>
      Children.map(children, (child) => {
        if (typeof child !== 'string') return child;
        if (!replyAnnotations || !/Annotation\s+\d+\s*[：:]/.test(child)) return child;
        const parts: ReactNode[] = [];
        let last = 0;
        let key = 0;
        for (const match of child.matchAll(REPLY_ANNOTATION_RE)) {
          const at = match.index;
          if (at > last) parts.push(child.slice(last, at));
          const anno = replyAnnotations.find((a) => a.index === Number(match[1]));
          parts.push(
            <span
              key={key++}
              className="dr-chip dr-reply-anno"
              title={anno ? `「${anno.quote}」\n批注：${anno.note || '（无）'}` : undefined}
            >
              Annotation {match[1]}：
            </span>,
          );
          last = at + match[0].length;
        }
        if (last < child.length) parts.push(child.slice(last));
        return parts;
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

export function MessageBubble({ message }: { message: DisplayMessage }) {
  const [showReasoning, setShowReasoning] = useState(false);

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
      {message.reasoning && (
        <div className="dr-reasoning">
          <button className="dr-reasoning-toggle" onClick={() => setShowReasoning((v) => !v)}>
            {showReasoning ? (
              <ChevronDown size={13} strokeWidth={1.8} />
            ) : (
              <ChevronRight size={13} strokeWidth={1.8} />
            )}
            思维链
          </button>
          {showReasoning && <div className="dr-reasoning-body">{message.reasoning}</div>}
        </div>
      )}
      <div className="dr-md">
        <AssistantContent content={message.text} replyAnnotations={message.replyAnnotations} />
      </div>
      {message.interrupted && <div className="dr-interrupted">（已中断）</div>}
    </div>
  );
}
