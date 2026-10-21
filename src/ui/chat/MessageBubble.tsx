/**
 * 单条消息气泡：
 * - 用户消息：协议块隐藏，只显示提问 + 批注 chip（hover 查看）。
 * - 助手消息：Markdown 渲染；reasoning 折叠；Annotation N： 渲染为 hoverable chip。
 */
import { useMemo, useState } from 'react';
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

/** 助手文本渲染：把 Annotation N： 标签替换为 hoverable chip。 */
function AssistantContent({
  content,
  replyAnnotations,
}: {
  content: string;
  replyAnnotations?: AnnotationItem[];
}) {
  const segments = useMemo(() => {
    if (!replyAnnotations || replyAnnotations.length === 0) return [{ text: content }];
    const out: Array<{ text?: string; annoIndex?: number }> = [];
    let last = 0;
    for (const match of content.matchAll(REPLY_ANNOTATION_RE)) {
      const at = match.index;
      if (at > last) out.push({ text: content.slice(last, at) });
      out.push({ annoIndex: Number(match[1]) });
      last = at + match[0].length;
    }
    if (last < content.length) out.push({ text: content.slice(last) });
    return out;
  }, [content, replyAnnotations]);

  return (
    <>
      {segments.map((seg, i) => {
        if (seg.text !== undefined) {
          return (
            <ReactMarkdown key={i} remarkPlugins={[remarkGfm]}>
              {seg.text}
            </ReactMarkdown>
          );
        }
        const anno = replyAnnotations?.find((a) => a.index === seg.annoIndex);
        return (
          <span
            key={i}
            className="dr-chip dr-reply-anno"
            title={anno ? `「${anno.quote}」\n批注：${anno.note || '（无）'}` : undefined}
          >
            Annotation {seg.annoIndex}：
          </span>
        );
      })}
    </>
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
