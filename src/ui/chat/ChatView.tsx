/**
 * 聊天主视图：会话状态中枢。
 * 状态来源 = 快照（loadHistory）+ 实时推送（Port 事件）。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { History, Plus, Settings2 } from 'lucide-react';
import type { SessionEvent } from '../../core/session/events';
import type { AskUserQuestion } from '../../core/agent/tools';
import type { StreamDelta } from '../../core/llm/stream';
import type { AnnotationItem, ConversationMeta, Settings } from '../../types';
import type { PanelSnapshot } from '../../types/protocol';
import { connectPanelEvents, request } from '../shared/backend';
import { AskUserCard } from './AskUserCard';
import { Composer, type ModelChoice } from './Composer';
import { MessageList } from './MessageList';

interface Props {
  conversation: ConversationMeta;
  onNew: () => void;
  onOpenHistory: () => void;
  onOpenSettings: () => void;
}

interface StreamingState {
  reasoning: string;
  content: string;
  reasoningStart?: number;
  reasoningMs?: number;
}

interface TurnState {
  running: boolean;
  step?: number;
  toolNames?: string[];
  error?: string;
}

export function ChatView({ conversation, onNew, onOpenHistory, onOpenSettings }: Props) {
  const [events, setEvents] = useState<SessionEvent[]>([]);
  const [streaming, setStreaming] = useState<StreamingState | null>(null);
  const [turn, setTurn] = useState<TurnState>({ running: false });
  const [question, setQuestion] = useState('');
  const [annotations, setAnnotations] = useState<AnnotationItem[]>([]);
  const [modelChoice, setModelChoice] = useState<ModelChoice>({
    model: 'deepseek-flash',
    reasoningEffort: 'high',
  });
  const [askUser, setAskUser] = useState<{ requestId: string; questions: AskUserQuestion[] } | null>(null);
  const [title, setTitle] = useState(conversation.title);
  const conversationIdRef = useRef(conversation.id);
  conversationIdRef.current = conversation.id;

  useEffect(() => setTitle(conversation.title), [conversation.title]);

  // 初始快照：历史事件 + 草稿。
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // 三个独立请求并行，缩短首屏。
      const [snapshot, settings] = await Promise.all([
        request<PanelSnapshot>({ kind: 'loadHistory', conversationId: conversation.id }),
        request<Settings>({ kind: 'getSettings' }),
      ]);
      if (cancelled) return;
      setEvents(snapshot.events);
      setQuestion(snapshot.draft.question);
      setAnnotations(snapshot.draft.annotations);
      setModelChoice({ model: settings.model, reasoningEffort: settings.reasoningEffort });
      // 未发送页面批注的高亮恢复。
      if (snapshot.draft.annotations.some((a) => a.source.kind === 'page')) {
        void request({ kind: 'restoreHighlights', conversationId: conversation.id });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [conversation.id]);

  // 实时推送通道。
  useEffect(() => {
    return connectPanelEvents((event) => {
      switch (event.kind) {
        case 'streamDelta': {
          if (event.conversationId !== conversationIdRef.current) return;
          const d: StreamDelta = event.delta;
          setStreaming((prev) => {
            const next: StreamingState = {
              reasoning: (prev?.reasoning ?? '') + (d.reasoning ?? ''),
              content: (prev?.content ?? '') + (d.content ?? ''),
              ...(prev?.reasoningStart ? { reasoningStart: prev.reasoningStart } : {}),
              ...(prev?.reasoningMs ? { reasoningMs: prev.reasoningMs } : {}),
            };
            // 思维链计时：首个 reasoning 增量起，首个正文增量止。
            if (d.reasoning && !next.reasoningStart) next.reasoningStart = Date.now();
            if (d.content && next.reasoningStart && !next.reasoningMs) {
              next.reasoningMs = Date.now() - next.reasoningStart;
            }
            return next;
          });
          break;
        }
        case 'sessionEvent':
          if (event.conversationId !== conversationIdRef.current) return;
          if (event.event.type === 'assistant/message') setStreaming(null);
          setEvents((prev) => [...prev, event.event]);
          break;
        case 'turnState':
          if (event.conversationId !== conversationIdRef.current) return;
          setTurn({
            running: event.state === 'running',
            ...(event.step !== undefined ? { step: event.step } : {}),
            ...(event.toolNames ? { toolNames: event.toolNames } : {}),
            ...(event.error ? { error: event.error } : {}),
          });
          if (event.state === 'running') setStreaming({ reasoning: '', content: '' });
          if (event.state === 'idle') setStreaming(null);
          break;
        case 'askUser':
          if (event.conversationId !== conversationIdRef.current) return;
          setAskUser({ requestId: event.requestId, questions: event.questions });
          break;
        case 'draftUpdated':
          // 页面侧批注（新增/编辑/删除）由 background 写草稿后广播，面板以草稿为准。
          if (event.conversationId !== conversationIdRef.current) return;
          setAnnotations(event.annotations);
          break;
        case 'conversationRenamed':
          if (event.conversationId === conversationIdRef.current) setTitle(event.title);
          break;
        default:
          break;
      }
    });
  }, []);

  const addAnnotation = useCallback(
    (quote: string, note: string, messageId: string) => {
      setAnnotations((prev) => [
        ...prev,
        { index: prev.length + 1, quote, note, source: { kind: 'chat', messageId } },
      ]);
    },
    [],
  );

  // 草稿持久化（防抖）。
  useEffect(() => {
    const timer = setTimeout(() => {
      void request({
        kind: 'saveDraft',
        conversationId: conversation.id,
        question,
        annotations,
      });
    }, 600);
    return () => clearTimeout(timer);
  }, [question, annotations, conversation.id]);

  const handleSend = useCallback(async () => {
    const q = question;
    const anns = annotations;
    setQuestion('');
    setAnnotations([]);
    setTurn({ running: true });
    await request({
      kind: 'sendMessage',
      conversationId: conversation.id,
      question: q,
      annotations: anns,
      thinkingEnabled: true, // 思维链常开，不暴露开关
    });
  }, [question, annotations, conversation.id]);

  const handleModelChoiceChange = useCallback(async (choice: ModelChoice) => {
    setModelChoice(choice);
    const settings = await request<Settings>({ kind: 'getSettings' });
    await request({
      kind: 'saveSettings',
      settings: { ...settings, model: choice.model, reasoningEffort: choice.reasoningEffort },
    });
  }, []);

  return (
    <div className="dr-chat">
      <header className="dr-chat-header">
        {/* Chrome 原生侧边栏已带品牌与关闭按钮，这里不重复。 */}
        <button className="dr-icon-btn" onClick={onOpenHistory} title="会话列表">
          <History size={16} strokeWidth={1.8} />
        </button>
        <div className="dr-chat-title" title={title}>
          {title}
        </div>
        <div className="dr-header-actions">
          <button className="dr-icon-btn" title="新会话" onClick={onNew}>
            <Plus size={16} strokeWidth={1.8} />
          </button>
          <button className="dr-icon-btn" onClick={onOpenSettings} title="设置">
            <Settings2 size={16} strokeWidth={1.8} />
          </button>
        </div>
      </header>
      <MessageList
        conversationId={conversation.id}
        events={events}
        streaming={streaming}
        onAnnotateSelection={addAnnotation}
        draftAnnotations={annotations}
      />
      {turn.running && (
        <div className="dr-status">
          {turn.toolNames ? `大肥鱼翻书中（${turn.toolNames.join('、')}）…` : '大肥鱼干饭中…'}
        </div>
      )}
      {turn.error && <div className="dr-error">{turn.error}</div>}
      {askUser && (
        <AskUserCard
          questions={askUser.questions}
          onSubmit={(answers) => {
            void request({ kind: 'answerAskUser', requestId: askUser.requestId, answers });
            setAskUser(null);
          }}
        />
      )}
      <Composer
        question={question}
        annotations={annotations}
        running={turn.running}
        modelChoice={modelChoice}
        onQuestionChange={setQuestion}
        onAnnotationsChange={setAnnotations}
        onModelChoiceChange={(c) => void handleModelChoiceChange(c)}
        onSend={() => void handleSend()}
        onCancel={() => void request({ kind: 'cancelTurn', conversationId: conversation.id })}
      />
    </div>
  );
}
