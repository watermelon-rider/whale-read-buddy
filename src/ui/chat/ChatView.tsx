/**
 * 聊天主视图：会话状态中枢。
 * 状态来源 = 快照（loadHistory）+ 实时推送（Port 事件）。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
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
  onOpenHistory: () => void;
  onOpenSettings: () => void;
}

interface TurnState {
  running: boolean;
  step?: number;
  toolNames?: string[];
  error?: string;
}

export function ChatView({ conversation, onOpenHistory, onOpenSettings }: Props) {
  const [events, setEvents] = useState<SessionEvent[]>([]);
  const [streaming, setStreaming] = useState<{ reasoning: string; content: string } | null>(null);
  const [turn, setTurn] = useState<TurnState>({ running: false });
  const [question, setQuestion] = useState('');
  const [annotations, setAnnotations] = useState<AnnotationItem[]>([]);
  const [modelChoice, setModelChoice] = useState<ModelChoice>({
    model: 'deepseek-flash',
    reasoningEffort: 'high',
  });
  const [askUser, setAskUser] = useState<{ requestId: string; questions: AskUserQuestion[] } | null>(null);
  const conversationIdRef = useRef(conversation.id);
  conversationIdRef.current = conversation.id;

  // 初始快照：历史事件 + 草稿。
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const snapshot = await request<PanelSnapshot>({ kind: 'loadHistory', conversationId: conversation.id });
      if (cancelled) return;
      setEvents(snapshot.events);
      setQuestion(snapshot.draft.question);
      setAnnotations(snapshot.draft.annotations);
      const settings = await request<Settings>({ kind: 'getSettings' });
      if (!cancelled) {
        setModelChoice({ model: settings.model, reasoningEffort: settings.reasoningEffort });
      }
      // 未发送页面批注的高亮恢复。
      if (snapshot.draft.annotations.some((a) => a.source.kind === 'page')) {
        await request({ kind: 'restoreHighlights', conversationId: conversation.id });
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
          setStreaming((prev) => ({
            reasoning: (prev?.reasoning ?? '') + (d.reasoning ?? ''),
            content: (prev?.content ?? '') + (d.content ?? ''),
          }));
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
        <button className="dr-icon-btn" onClick={onOpenHistory} title="会话列表">
          ☰
        </button>
        <div className="dr-chat-title" title={conversation.title}>
          {conversation.title}
        </div>
        <button className="dr-icon-btn" onClick={onOpenSettings} title="设置">
          ⚙
        </button>
      </header>
      <MessageList
        events={events}
        streaming={streaming}
        onAnnotateSelection={addAnnotation}
      />
      {turn.running && (
        <div className="dr-status">
          {turn.toolNames ? `正在调用工具：${turn.toolNames.join('、')}…` : '正在思考…'}
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
