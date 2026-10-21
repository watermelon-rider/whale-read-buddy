/** 跨 context 共享的领域类型。core/ 与 services/、ui/ 都从这里取类型。 */

/** 一条划词批注（草稿态与已发送态共用）。 */
export interface AnnotationItem {
  /** 会话内稳定序号，从 1 开始，按收集顺序编号。 */
  index: number;
  /** 选中的原文。 */
  quote: string;
  /** 用户写的批注，可为空字符串（仅标记）。 */
  note: string;
  /** 批注来源：页面划词 / 对话内划词。 */
  source: { kind: 'page' } | { kind: 'chat'; messageId: string };
  /** 页面批注的前后文锚点：quote 在页面出现多次时用于消歧。 */
  anchor?: { prefix: string; suffix: string };
}

/** 提取后的页面内容（context/page 节点的载荷）。 */
export interface PageContent {
  origin: string;
  /** 归一化后的 URL（去 hash、去跟踪参数）。 */
  url: string;
  title: string;
  /** 正文 Markdown。 */
  markdown: string;
  /** 正文内容哈希（用于同会话内重复注入去重）。 */
  contentHash: string;
  /** 正文是否被截断过。 */
  truncated: boolean;
  /** 页面类型。 */
  kind: 'html' | 'pdf';
}

/** 模型路由设置。 */
export type ModelId = 'deepseek-flash' | 'deepseek-v4-pro';

export interface Settings {
  apiKey: string;
  /** 聊天端点基址，默认 https://api.deepseek.com */
  baseURL: string;
  /** Search/Fetch 工具端点基址，默认 https://api.deepseek.com/v1/tools */
  toolsBaseURL: string;
  model: ModelId;
  /** 思考模式默认开关（会话级可在 Composer 覆盖）。 */
  thinkingEnabled: boolean;
  reasoningEffort: 'low' | 'high' | 'max';
  /** persona：陪读人设文本，空串用默认。 */
  persona: string;
  /** 全局指令。 */
  globalInstructions: string;
}

export const DEFAULT_SETTINGS: Settings = {
  apiKey: '',
  baseURL: 'https://api.deepseek.com',
  toolsBaseURL: 'https://api.deepseek.com/v1/tools',
  model: 'deepseek-flash',
  thinkingEnabled: true,
  reasoningEffort: 'high',
  persona: '',
  globalInstructions: '',
};

/** 会话元信息（列表页展示用）。 */
export interface ConversationMeta {
  id: string;
  origin: string;
  /** 最近一条 context/page 的标题，或"新会话"。 */
  title: string;
  /** 用户在历史列表手动改过标题后锁定，LLM 不再自动命名。 */
  titleLocked?: boolean;
  createdAt: number;
  updatedAt: number;
}

/** 归一化 URL：去 hash、去常见跟踪参数。 */
export function normalizeUrl(rawUrl: string): string {
  try {
    const u = new URL(rawUrl);
    u.hash = '';
    const tracking = /^utm_|^spm$|^ref$|^from$|^fbclid$|^gclid$/i;
    for (const key of [...u.searchParams.keys()]) {
      if (tracking.test(key)) u.searchParams.delete(key);
    }
    u.searchParams.sort();
    return u.toString();
  } catch {
    return rawUrl;
  }
}

export function originOf(rawUrl: string): string {
  try {
    return new URL(rawUrl).origin;
  } catch {
    return 'unknown';
  }
}
