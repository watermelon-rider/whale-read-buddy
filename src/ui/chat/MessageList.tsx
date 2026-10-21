/**
 * 消息列表：把会话事件投影为展示消息 + 流式增量气泡。
 * 同时承载对话内划词批注（SelectionAnnotator）。
 */
import { useEffect, useMemo, useRef } from 'react';
import type { SessionEvent } from '../../core/session/events';
import type { AnnotationItem } from '../../types';
import { MessageBubble, type DisplayMessage } from './MessageBubble';
import { SelectionAnnotator } from './SelectionAnnotator';

interface Props {
  events: SessionEvent[];
  streaming: { reasoning: string; content: string } | null;
  onAnnotateSelection: (quote: string, messageId: string) => void;
}

/** 把事件日志投影为 UI 消息（deriveDisplayMessages）。 */
function toDisplayMessages(events: SessionEvent[]): DisplayMessage[] {
  const messages: DisplayMessage[] = [];
  let lastAnnotations: AnnotationItem[] | undefined;
  for (const e of events) {
    switch (e.type) {
      case 'user/message': {
        lastAnnotations = e.data.annotations;
        messages.push({
          id: `evt-${e.seq}`,
          role: 'user',
          text: e.data.text,
          ...(e.data.annotations ? { annotations: e.data.annotations } : {}),
        });
        break;
      }
      case 'assistant/message':
        messages.push({
          id: `evt-${e.seq}`,
          role: 'assistant',
          text: e.data.content,
          ...(e.data.reasoning ? { reasoning: e.data.reasoning } : {}),
          ...(lastAnnotations ? { replyAnnotations: lastAnnotations } : {}),
          ...(e.data.interrupted ? { interrupted: true } : {}),
        });
        break;
      case 'context/page':
        messages.push({
          id: `evt-${e.seq}`,
          role: 'assistant',
          text: `> 📄 已读取页面：${e.data.title}${e.data.truncated ? '（已截断）' : ''}`,
        });
        break;
      case 'tool/result':
        messages.push({
          id: `evt-${e.seq}`,
          role: 'assistant',
          text: `> 🔧 工具 ${e.data.name} ${e.data.isError ? '执行出错' : '已完成'}`,
        });
        break;
      case 'compaction/summary':
        messages.push({
          id: `evt-${e.seq}`,
          role: 'assistant',
          text: '> 🗜️ 较早的对话已压缩为摘要。',
        });
        break;
      default:
        break;
    }
  }
  return messages;
}

export function MessageList({ events, streaming, onAnnotateSelection }: Props) {
  const messages = useMemo(() => toDisplayMessages(events), [events]);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, streaming?.content.length]);

  return (
    <div className="dr-msg-list">
      <SelectionAnnotator onAnnotate={onAnnotateSelection}>
        {messages.length === 0 && !streaming && (
          <div className="dr-empty">
            我是你的陪读伙伴。打开想读的页面，直接提问即可；
            也可以在页面或对话里划词批注，随问题一起发给我。
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} data-message-id={m.id}>
            <MessageBubble message={m} />
          </div>
        ))}
        {streaming && (
          <MessageBubble
            message={{
              id: 'streaming',
              role: 'assistant',
              text: streaming.content,
              ...(streaming.reasoning ? { reasoning: streaming.reasoning } : {}),
            }}
          />
        )}
        <div ref={bottomRef} />
      </SelectionAnnotator>
    </div>
  );
}
