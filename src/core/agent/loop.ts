/**
 * Agent 循环：turn/step 状态机（借鉴 dsh-agent-loop，按比例缩小）。
 *
 * 一个 turn：领取用户输入 → 若干 step（请求 → 工具调用 → 追加事实 → 必要时下一 step）。
 * 模型可见的一切在请求前都已提交进会话日志。
 */
import type { Settings } from '../../types';
import { streamChat, DeepSeekApiError, type ChatResult } from '../llm/deepseek';
import type { StreamDelta } from '../llm/stream';
import type { Session } from '../session/session';
import { dispatchToolCall, TOOL_SCHEMAS, type ToolExecutor } from './tools';
import { maybeCompact } from '../session/compaction';
import { buildTimeContext, TIME_CONTEXT_MIN_INTERVAL_MS } from '../prompt/system';

export interface LoopDeps {
  session: Session;
  settings: Settings;
  executor: ToolExecutor;
  /** 每个流式增量帧回调（UI 实时渲染）。 */
  onDelta: (d: StreamDelta) => void;
  /** step 边界回调（供 UI 显示"正在调用工具…"等状态）。 */
  onStep?: (info: { step: number; toolNames?: string[] }) => void;
  /** 组装系统提示词（persona/指令/工具指引），由 services 层按当前 origin 提供。 */
  buildSystemPrompt: () => string;
}

export interface TurnInput {
  /** 触发本轮的用户提问原文（供 Search API 的 ori_question）。 */
  question: string;
  thinkingEnabled: boolean;
}

const MAX_STEPS_PER_TURN = 8;

export class AgentLoop {
  private abortController?: AbortController;
  private lastTimeContextAt = 0;

  constructor(private readonly deps: LoopDeps) {}

  /** 协作式取消当前活动；已交付文本由调用方落盘。 */
  cancel(): void {
    this.abortController?.abort();
  }

  async runTurn(input: TurnInput): Promise<{ error?: string }> {
    const { session, settings } = this.deps;
    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    try {
      // token 压力检查：必要时先压缩（溢出错误兜底在 catch 里做）。
      await maybeCompact(session, settings, signal);

      for (let step = 0; step < MAX_STEPS_PER_TURN; step++) {
        this.deps.onStep?.({ step });
        this.injectTimeContext();

        const result = await this.runStep(input.thinkingEnabled, signal);

        if (result.interrupted) {
          session.append('assistant/message', {
            content: result.content,
            reasoning: result.reasoning || undefined,
            interrupted: true,
          });
          return {};
        }

        session.append('assistant/message', {
          content: result.content,
          reasoning: result.reasoning || undefined,
          toolCalls: result.toolCalls.length > 0 ? result.toolCalls : undefined,
        });

        if (result.toolCalls.length === 0) return {};
        this.deps.onStep?.({ step, toolNames: result.toolCalls.map((t) => t.name) });

        // 执行工具并追加结果（串行；类型上保留并行口子）。
        for (const call of result.toolCalls) {
          const outcome = await dispatchToolCall(this.deps.executor, call.name, call.argumentsJson, {
            signal,
            originalQuestion: input.question,
          });
          session.append('tool/result', {
            toolCallId: call.id,
            name: call.name,
            content: outcome.content,
            isError: outcome.isError || undefined,
          });
          if (signal.aborted) return {};
        }
      }
      return { error: '工具调用轮数超过上限，已中止。' };
    } catch (err) {
      // 上下文溢出兜底：压缩一次，提示用户重试（不在本回合自动重试，避免递归）。
      const message = err instanceof Error ? err.message : String(err);
      session.append('assistant/attempt', { error: message });
      return { error: message };
    }
  }

  private async runStep(thinkingEnabled: boolean, signal: AbortSignal): Promise<ChatResult> {
    const { session, settings } = this.deps;
    // 系统提示词作为日志节点维护：变更时追加新节点（最新非空节点生效）。
    const prompt = this.deps.buildSystemPrompt();
    const latest = this.latestSystemPrompt();
    if (prompt !== latest) session.append('system/message', { content: prompt });

    session.append('request/header', {
      model: settings.model,
      thinkingEnabled,
      reasoningEffort: settings.reasoningEffort,
      tools: TOOL_SCHEMAS.map((t) => t.function.name),
    });

    const messages = session.deriveMessages();
    const base = {
      messages,
      tools: TOOL_SCHEMAS,
      model: settings.model,
      thinkingEnabled,
      reasoningEffort: settings.reasoningEffort,
      signal,
    };
    try {
      // 前缀续写强制「脑回路：」开头（提示词约束已被证明不可靠）。
      return await streamChat(settings, { ...base, prefixContinuation: '脑回路：' }, this.deps.onDelta);
    } catch (err) {
      // Beta 前缀与 tools/思考模式的组合若被拒绝（400），退化为普通请求。
      if (err instanceof DeepSeekApiError && err.status === 400) {
        return streamChat(settings, base, this.deps.onDelta);
      }
      throw err;
    }
  }

  private latestSystemPrompt(): string | undefined {
    const events = this.deps.session.snapshot();
    for (let i = events.length - 1; i >= 0; i--) {
      const e = events[i];
      if (e?.type === 'system/message') return e.data.content;
    }
    return undefined;
  }

  /** time-context 注入：距上次注入不足最小间隔则跳过。 */
  private injectTimeContext(): void {
    const now = Date.now();
    if (now - this.lastTimeContextAt < TIME_CONTEXT_MIN_INTERVAL_MS) return;
    this.lastTimeContextAt = now;
    const lastModelVisible = [...this.deps.session.snapshot()]
      .reverse()
      .find((e) => e.type === 'user/message' || e.type === 'assistant/message');
    const ctx = buildTimeContext(new Date(now), lastModelVisible?.at);
    this.deps.session.append('context/time', ctx);
  }
}

/** 供 UI 判断错误类型。 */
export function isApiError(err: unknown): err is DeepSeekApiError {
  return err instanceof DeepSeekApiError;
}
