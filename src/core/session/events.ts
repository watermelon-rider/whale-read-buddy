/**
 * 会话事件类型定义（借鉴 deepseek-harness dsh-session）。
 * 会话是一条 append-only 的类型化事件日志；模型可见即已记录。
 */
import type { AnnotationItem, ModelId, PageContent } from '../../types';

/** 工具调用的模型侧参数（OpenAI tool_calls 格式）。 */
export interface ToolCall {
  id: string;
  name: string;
  /** JSON 字符串形式的参数。 */
  argumentsJson: string;
}

export interface RequestHeader {
  model: ModelId;
  thinkingEnabled: boolean;
  reasoningEffort: 'low' | 'high' | 'max';
  /** 本请求可见的工具名列表。 */
  tools: string[];
}

export interface SessionEventMap {
  /** 请求头：模型/思考模式/工具集变更时记录。仅元数据，不进模型历史。 */
  'request/header': RequestHeader;
  /** 系统提示词节点；最新非空节点为有效提示词。 */
  'system/message': { content: string };
  /** 页面内容注入。 */
  'context/page': PageContent;
  /** 时钟读数（time-context）。 */
  'context/time': { iso: string; timeZone: string; elapsedSeconds: number | 'unavailable' };
  /** 用户消息；annotations 存在时已按协议块拼入 text，此字段供 UI 渲染 chip。 */
  'user/message': { text: string; annotations?: AnnotationItem[] };
  /** 助手消息。携带 tools 的请求必须回传 reasoning，故完整保留。 */
  'assistant/message': {
    content: string;
    reasoning?: string;
    toolCalls?: ToolCall[];
    interrupted?: boolean;
  };
  /** 失败/取消的尝试；不进模型历史。 */
  'assistant/attempt': { error: string };
  /** 工具结果（tool/call 合并进 assistant/message.toolCalls，这里只记结果）。 */
  'tool/result': { toolCallId: string; name: string; content: string; isError?: boolean };
  /** 压缩摘要节点；遮蔽 [0, coversSeq] 区间的模型可见事件。 */
  'compaction/summary': { coversSeq: number; text: string };
}

export type SessionEventType = keyof SessionEventMap;

/** 判别联合：switch (e.type) 可精确收窄 data。 */
export type SessionEvent<T extends SessionEventType = SessionEventType> = {
  [K in SessionEventType]: { seq: number; type: K; data: SessionEventMap[K]; at: number };
}[T];
