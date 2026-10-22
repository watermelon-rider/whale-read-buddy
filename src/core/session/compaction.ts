/**
 * 会话压缩（借鉴 dsh-compaction-basic）：
 * token 压力超阈值时，用同模型把较早历史摘要为 compaction/summary 节点，
 * 遮蔽旧历史、保留近期消息；只遮蔽不删除。
 */
import type { Settings } from '../../types';
import { streamChat } from '../llm/deepseek';
import type { ChatMessage, Session } from './session';
import { t } from '../../i18n';

export interface CompactionPolicy {
  /** 触发压缩的上下文占用比。 */
  thresholdRatio: number;
  /** 压缩后保留近期消息的目标比例。 */
  retainRatio: number;
}

export const DEFAULT_POLICY: CompactionPolicy = { thresholdRatio: 0.8, retainRatio: 0.16 };

/** 模型上下文窗口（token）。 */
const CONTEXT_WINDOWS: Record<string, number> = {
  'deepseek-flash': 1_000_000,
  'deepseek-v4-pro': 1_000_000,
};

/** 粗估 token 数：DeepSeek 无官方 tokenizer，按 chars/2.5 保守估计。 */
export function estimateTokens(messages: ChatMessage[]): number {
  let chars = 0;
  for (const m of messages) {
    chars += (m.content?.length ?? 0) + (m.reasoning_content?.length ?? 0);
    for (const tc of m.tool_calls ?? []) chars += tc.function.arguments.length + 32;
  }
  return Math.ceil(chars / 2.5);
}

export function contextWindowOf(model: string): number {
  return CONTEXT_WINDOWS[model] ?? 1_000_000;
}

export function shouldCompact(
  session: Session,
  model: string,
  policy: CompactionPolicy = DEFAULT_POLICY,
): boolean {
  return estimateTokens(session.deriveMessages()) >= contextWindowOf(model) * policy.thresholdRatio;
}

/**
 * 若超过阈值则执行一次压缩。压缩用一次额外模型请求，只保留返回的摘要文本。
 */
export async function maybeCompact(
  session: Session,
  settings: Pick<Settings, 'apiKey' | 'baseURL' | 'model'>,
  signal?: AbortSignal,
  policy: CompactionPolicy = DEFAULT_POLICY,
  force = false,
): Promise<boolean> {
  if (!force && !shouldCompact(session, settings.model, policy)) return false;

  const messages = session.deriveMessages();
  // 保留尾部 retainRatio 对应的消息，之前的全部摘要。
  const retainCount = Math.max(2, Math.floor(messages.length * policy.retainRatio));
  const head = messages.slice(0, Math.max(0, messages.length - retainCount));
  if (head.length === 0) return false;

  const headText = head
    .map((m) => `[${m.role}] ${m.content ?? ''}`)
    .join('\n\n')
    .slice(0, 100_000);

  const result = await streamChat(
    settings,
    {
      messages: [
        { role: 'system', content: t('compactionSummaryPrompt') },
        { role: 'user', content: headText },
      ],
      model: settings.model,
      thinkingEnabled: false,
      reasoningEffort: 'low',
      signal,
    },
    () => {},
  );

  // 找到投影中最后一条被遮蔽事件的 seq：从头数 head 覆盖的模型可见事件。
  let visibleSeen = 0;
  let coversSeq = 0;
  for (const e of session.snapshot()) {
    const visible =
      e.type === 'context/page' ||
      e.type === 'context/time' ||
      e.type === 'user/message' ||
      e.type === 'assistant/message' ||
      e.type === 'tool/result';
    if (visible) visibleSeen++;
    coversSeq = e.seq;
    if (visibleSeen >= head.length) break;
  }

  session.append('compaction/summary', { coversSeq, text: result.content });
  return true;
}
