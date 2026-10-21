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
import { AnnoPopover } from '../shared/AnnoPopover';

interface Props {
  conversationId: string;
  events: SessionEvent[];
  streaming: {
    reasoning: string;
    content: string;
    reasoningStart?: number;
    reasoningMs?: number;
  } | null;
  onAnnotateSelection: (quote: string, note: string, messageId: string) => void;
  /** 草稿批注（对话内批注在消息里画引用高亮与角标）。 */
  draftAnnotations?: AnnotationItem[];
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
          ...(e.data.reasoningMs ? { reasoningMs: e.data.reasoningMs } : {}),
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
          text: `大肥鱼看了你的网页：${e.data.title}${e.data.truncated ? '（太长，只吃了一部分）' : ''}`,
        });
        break;
      case 'tool/result':
        items.push({
          kind: 'status',
          id: `evt-${e.seq}`,
          icon: Wrench,
          text: e.data.isError
            ? `大肥鱼想用 ${e.data.name}，但没成功`
            : `大肥鱼用 ${e.data.name} 查完啦`,
        });
        break;
      case 'compaction/summary':
        items.push({
          kind: 'status',
          id: `evt-${e.seq}`,
          icon: Shrink,
          text: '大肥鱼消化了早前的聊天（已压缩成摘要）',
        });
        break;
      default:
        break;
    }
  }
  return items;
}

export function MessageList({
  conversationId,
  events,
  streaming,
  onAnnotateSelection,
  draftAnnotations,
}: Props) {
  const items = useMemo(() => toDisplayItems(events), [events]);
  const listRef = useRef<HTMLDivElement>(null);
  const marksRef = useRef<HTMLDivElement>(null);
  const [annoDetail, setAnnoDetail] = useState<{ anno: AnnotationItem; rect: DOMRect } | null>(null);
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
    // 只有明确回到底部才恢复跟随；上滚由 wheel/touch 处理器立即取消。
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 8) setPinned(true);
  };

  // 用户主动上滚（滚轮/触摸/键盘）立即取消跟随，避免流式自动滚动与之打架。
  const cancelFollow = () => setPinned(false);
  const handleWheel = (e: React.WheelEvent) => {
    if (e.deltaY < 0) cancelFollow();
  };
  const touchStartY = useRef(0);
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0]?.clientY ?? 0;
  };
  const handleTouchMove = (e: React.TouchEvent) => {
    const y = e.touches[0]?.clientY ?? 0;
    if (y > touchStartY.current) cancelFollow(); // 手指下拉 = 内容上滚
  };

  // 对话内批注的引用高亮：在对应消息元素里精确匹配 quote 并画高亮 + 蓝色角标。
  useEffect(() => {
    const container = marksRef.current;
    if (!container) return;
    // 清理旧标记（React 重渲染后需重画）。
    container.querySelectorAll('.dr-chat-anno-badge').forEach((n) => n.remove());
    container.querySelectorAll('.dr-chat-anno-mark').forEach((span) => {
      const parent = span.parentNode;
      if (!parent) return;
      while (span.firstChild) parent.insertBefore(span.firstChild, span);
      parent.removeChild(span);
      parent.normalize();
    });
    for (const a of draftAnnotations ?? []) {
      if (a.source.kind !== 'chat') continue;
      const msgEl = container.querySelector(`[data-message-id="${a.source.messageId}"]`);
      if (!msgEl) continue;
      const walker = document.createTreeWalker(msgEl, NodeFilter.SHOW_TEXT);
      let node: Node | null;
      let done = false;
      while ((node = walker.nextNode()) && !done) {
        const textNode = node as Text;
        const at = textNode.data.indexOf(a.quote);
        if (at === -1) continue;
        const target = textNode.splitText(at);
        target.splitText(a.quote.length);
        const mark = document.createElement('span');
        mark.className = 'dr-chat-anno-mark';
        target.parentNode?.replaceChild(mark, target);
        mark.appendChild(target);
        const badge = document.createElement('span');
        badge.className = 'dr-chat-anno-badge';
        badge.textContent = String(a.index);
        badge.title = '查看批注';
        badge.addEventListener('click', (e) => {
          e.stopPropagation();
          setAnnoDetail({ anno: a, rect: badge.getBoundingClientRect() });
        });
        mark.after(badge);
        done = true;
      }
    }
  }, [draftAnnotations, items]);

  return (
    <div className="dr-msg-wrap">
      <div
        className="dr-msg-list"
        ref={listRef}
        onScroll={handleScroll}
        onWheel={handleWheel}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
      >
        <SelectionAnnotator onAnnotate={onAnnotateSelection}>
          <div ref={marksRef}>
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
              streaming: true,
                ...(streaming.reasoning ? { reasoning: streaming.reasoning } : {}),
              ...(streaming.reasoningMs ? { reasoningMs: streaming.reasoningMs } : {}),
              }}
            />
          )}
          </div>
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
      {annoDetail && (
        <AnnoPopover
          rect={annoDetail.rect}
          quote={annoDetail.anno.quote}
          note={annoDetail.anno.note}
          onClose={() => setAnnoDetail(null)}
        />
      )}
    </div>
  );
}
