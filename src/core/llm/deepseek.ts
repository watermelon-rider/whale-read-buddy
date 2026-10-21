/**
 * DeepSeek API 客户端（OpenAI 兼容 chat/completions，SSE 流式）。
 * 纯逻辑模块：只依赖 fetch，不碰 chrome.*。
 */
import type { Settings } from '../../types';
import type { ChatMessage } from '../session/session';
import { iterateSSE, parseStreamChunk, type StreamDelta } from './stream';

export interface ToolSchema {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ChatRequest {
  messages: ChatMessage[];
  tools?: ToolSchema[];
  model: string;
  thinkingEnabled: boolean;
  reasoningEffort: 'low' | 'high' | 'max';
  signal?: AbortSignal;
}

export interface ChatResult {
  content: string;
  reasoning: string;
  toolCalls: Array<{ id: string; name: string; argumentsJson: string }>;
  finishReason?: string;
  usage?: { promptTokens?: number; completionTokens?: number };
  /** 被取消时已交付的部分也作为结果返回（interrupted 由调用方标记）。 */
  interrupted: boolean;
}

export class DeepSeekApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'DeepSeekApiError';
  }
}

function endpoint(baseURL: string): string {
  return `${baseURL.replace(/\/+$/, '')}/chat/completions`;
}

/**
 * 发起一次流式聊天请求。onDelta 在每个有效增量帧触发；
 * 聚合后的完整结果在流结束时返回。
 */
export async function streamChat(
  settings: Pick<Settings, 'apiKey' | 'baseURL'>,
  request: ChatRequest,
  onDelta: (d: StreamDelta) => void,
): Promise<ChatResult> {
  if (!settings.apiKey) {
    throw new DeepSeekApiError('未配置 API Key，请先到设置页填写。');
  }
  const body: Record<string, unknown> = {
    model: request.model,
    messages: request.messages,
    stream: true,
    thinking: { type: request.thinkingEnabled ? 'enabled' : 'disabled' },
  };
  if (request.thinkingEnabled) body.reasoning_effort = request.reasoningEffort;
  if (request.tools && request.tools.length > 0) body.tools = request.tools;

  const response = await fetch(endpoint(settings.baseURL), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.apiKey}`,
    },
    body: JSON.stringify(body),
    signal: request.signal ?? null,
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new DeepSeekApiError(
      `DeepSeek API 请求失败（HTTP ${response.status}）：${text.slice(0, 300)}`,
      response.status,
    );
  }
  if (!response.body) throw new DeepSeekApiError('响应无 body，无法流式读取。');

  const result: ChatResult = { content: '', reasoning: '', toolCalls: [], interrupted: false };
  const toolAcc = new Map<number, { id: string; name: string; argumentsJson: string }>();

  try {
    for await (const payload of iterateSSE(response.body, request.signal)) {
      const delta = parseStreamChunk(payload);
      if (!delta) continue;
      onDelta(delta);
      if (delta.reasoning) result.reasoning += delta.reasoning;
      if (delta.content) result.content += delta.content;
      if (delta.toolCall) {
        const tc = delta.toolCall;
        const acc = toolAcc.get(tc.index) ?? { id: '', name: '', argumentsJson: '' };
        if (tc.id) acc.id = tc.id;
        if (tc.name) acc.name = tc.name;
        if (tc.argumentsChunk) acc.argumentsJson += tc.argumentsChunk;
        toolAcc.set(tc.index, acc);
      }
      if (delta.finishReason) result.finishReason = delta.finishReason;
      if (delta.usage) result.usage = delta.usage;
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      result.interrupted = true;
    } else {
      throw err;
    }
  }
  result.toolCalls = [...toolAcc.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, v]) => v);
  return result;
}
