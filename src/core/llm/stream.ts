/**
 * SSE 解析：把 chat/completions 的流式响应解析为结构化增量。
 * DeepSeek 流式格式为 OpenAI 兼容的 data: 行，[DONE] 结束。
 */
export interface StreamDelta {
  /** 思维链增量（reasoning_content）。 */
  reasoning?: string;
  /** 正文增量。 */
  content?: string;
  /** 工具调用增量：index 定位第几个 tool_call。 */
  toolCall?: { index: number; id?: string; name?: string; argumentsChunk?: string };
  /** 结束原因。 */
  finishReason?: string;
  /** 用量（末帧可能携带）。 */
  usage?: { promptTokens?: number; completionTokens?: number };
}

interface RawToolCallDelta {
  index?: number;
  id?: string;
  function?: { name?: string; arguments?: string };
}

/** 解析单个 data: 载荷；[DONE] 与非 JSON 行返回 undefined。 */
export function parseStreamChunk(payload: string): StreamDelta | undefined {
  const trimmed = payload.trim();
  if (trimmed === '' || trimmed === '[DONE]') return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return undefined;
  }
  if (typeof parsed !== 'object' || parsed === null) return undefined;
  const root = parsed as {
    choices?: Array<{
      delta?: {
        reasoning_content?: string | null;
        content?: string | null;
        tool_calls?: RawToolCallDelta[];
      };
      finish_reason?: string | null;
    }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const out: StreamDelta = {};
  const choice = root.choices?.[0];
  if (choice?.delta) {
    const d = choice.delta;
    if (d.reasoning_content) out.reasoning = d.reasoning_content;
    if (d.content) out.content = d.content;
    const tc = d.tool_calls?.[0];
    if (tc) {
      out.toolCall = {
        index: tc.index ?? 0,
        id: tc.id,
        name: tc.function?.name,
        argumentsChunk: tc.function?.arguments,
      };
    }
    if (choice.finish_reason) out.finishReason = choice.finish_reason;
  }
  if (root.usage) {
    out.usage = {
      promptTokens: root.usage.prompt_tokens,
      completionTokens: root.usage.completion_tokens,
    };
  }
  return out;
}

/**
 * 把 Response.body 按 SSE 协议切分为 data: 载荷流，处理跨 chunk 的不完整行。
 */
export async function* iterateSSE(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let sep: number;
      while ((sep = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, sep).replace(/\r$/, '');
        buffer = buffer.slice(sep + 1);
        if (line.startsWith('data:')) {
          yield line.slice(5).trimStart();
        }
      }
    }
    if (buffer.startsWith('data:')) yield buffer.slice(5).trimStart();
  } finally {
    reader.releaseLock();
  }
}
