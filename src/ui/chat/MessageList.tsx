/**
 * 消息列表：把会话事件投影为展示消息 + 流式增量气泡。
 * 页面注入/工具调用/压缩渲染为 12px 状态行（与思维链同字号，lucide 图标）。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, FileText, Shrink, Wrench, type LucideIcon } from 'lucide-react';
import type { SessionEvent } from '../../core/session/events';
import type { AnnotationItem } from '../../types';
import { MessageBubble, type DisplayMessage } from './MessageBubble';
import { SelectionAnnotator } from './SelectionAnnotator';

interface Props {
  conversationId: string;
  events: SessionEvent[];
  streaming: { reasoning: string; content: string } | null;
  onAnnotateSelection: (quote: string, note: string, messageId: string) => void;
}

/** 每个会话记住滚动位置：切视图/重开面板都直接定位，不播回底动画。
 *  内存 Map（同次面板会话内快速恢复）+ chrome.storage.session（面板销毁后恢复）。 */
const scrollMemory = new Map<string, number>();

const scrollKey = (id: string) => `scroll:${id}`;

function persistScroll(conversationId: string, top: number): void {
  scrollMemory.set(conversationId, top);
  void chrome.storage.session?.set({ [scrollKey(conversationId)]: top }).catch(() => {});
}

async function readPersistedScroll(conversationId: string): Promise<number | undefined> {
  const mem = scrollMemory.get(conversationId);
  if (mem !== undefined) return mem;
  try {
    const raw = await chrome.storage.session?.get(scrollKey(conversationId));
    return raw?.[scrollKey(conversationId)] as number | undefined;
  } catch {
    return undefined;
  }
}

type DisplayItem =
  | { kind: 'message'; message: DisplayMessage }
  | { kind: 'status'; id: string; icon: LucideIcon; text: string };

/** 把事件日志投影为 UI 展示项。 */
function toDisplayItems(events: SessionEvent[]): DisplayItem[] {
  const items: DisplayItem[] = [];
  let lastAnnotations: AnnotationItem[] | undefined;
  for (const e of events) {
    switch (e.type) {
      case 'user/message': {
        lastAnnotations = e.data.annotations;
        items.push({
          kind: 'message',
          message: {
            id: `evt-${e.seq}`,
            role: 'user',
            text: e.data.text,
            ...(e.data.annotations ? { annotations: e.data.annotations } : {}),
          },
        });
        break;
      }
      case 'assistant/message':
        items.push({
          kind: 'message',
          message: {
            id: `evt-${e.seq}`,
            role: 'assistant',
            text: e.data.content,
            ...(e.data.reasoning ? { reasoning: e.data.reasoning } : {}),
            ...(lastAnnotations ? { replyAnnotations: lastAnnotations } : {}),
            ...(e.data.interrupted ? { interrupted: true } : {}),
          },
        });
        break;
      case 'context/page':
        items.push({
          kind: 'status',
          id: `evt-${e.seq}`,
          icon: FileText,
          text: `已读取页面：${e.data.title}${e.data.truncated ? '（已截断）' : ''}`,
        });
        break;
      case 'tool/result':
        items.push({
          kind: 'status',
          id: `evt-${e.seq}`,
          icon: Wrench,
          text: `工具 ${e.data.name} ${e.data.isError ? '执行出错' : '已完成'}`,
        });
        break;
      case 'compaction/summary':
        items.push({
          kind: 'status',
          id: `evt-${e.seq}`,
          icon: Shrink,
          text: '较早的对话已压缩为摘要',
        });
        break;
      default:
        break;
    }
  }
  return items;
}

export function MessageList({ conversationId, events, streaming, onAnnotateSelection }: Props) {
  const items = useMemo(() => toDisplayItems(events), [events]);
  const listRef = useRef<HTMLDivElement>(null);
  // 用户上滚时钉住当前位置，不回到底部；点按钮恢复跟随。
  const [pinned, setPinned] = useState(true);
  const restoredRef = useRef(false);

  // 挂载后恢复上次的滚动位置；没有记忆则定位到底部（无动画）。
  useEffect(() => {
    if (restoredRef.current) return;
    let cancelled = false;
    void (async () => {
      const el = listRef.current;
      if (!el) return;
      const saved = await readPersistedScroll(conversationId);
      // 内容尚未渲染出来时不恢复，等下一轮。
      if (saved !== undefined && items.length === 0) return;
      if (cancelled || restoredRef.current) return;
      if (saved !== undefined) {
        el.scrollTop = saved;
        const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
        setPinned(atBottom);
      } else {
        el.scrollTop = el.scrollHeight;
      }
      restoredRef.current = true;
    })();
    return () => {
      cancelled = true;
    };
  }, [conversationId, items.length]);

  const scrollToBottom = (behavior: ScrollBehavior) => {
    const el = listRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior });
  };

  // 新消息/流式增量到达时，仅在跟随状态下滚到底。
  useEffect(() => {
    if (pinned) scrollToBottom('auto');
  }, [items.length, streaming?.content.length, streaming?.reasoning?.length, pinned]);

  const handleScroll = () => {
    const el = listRef.current;
    if (!el) return;
    persistScroll(conversationId, el.scrollTop);
    setPinned(el.scrollHeight - el.scrollTop - el.clientHeight < 48);
  };

  return (
    <div className="dr-msg-wrap">
      <div className="dr-msg-list" ref={listRef} onScroll={handleScroll}>
        <SelectionAnnotator onAnnotate={onAnnotateSelection}>
          {items.length === 0 && !streaming && (
            <div className="dr-empty">
              打开想读的页面，直接提问即可；
              也可以在页面或对话里划词批注，随问题一起发给我。
            </div>
          )}
          {items.map((item) =>
            item.kind === 'status' ? (
              <div key={item.id} className="dr-status-line">
                <item.icon size={13} strokeWidth={1.8} />
                <span>{item.text}</span>
              </div>
            ) : (
              <div key={item.message.id} data-message-id={item.message.id}>
                <MessageBubble message={item.message} />
              </div>
            ),
          )}
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
        </SelectionAnnotator>
      </div>
      {!pinned && (
        <button
          className="dr-scroll-bottom"
          title="回到最新"
          onClick={() => {
            setPinned(true);
            scrollToBottom('smooth');
          }}
        >
          <ArrowDown size={15} strokeWidth={2} />
        </button>
      )}
    </div>
  );
}
