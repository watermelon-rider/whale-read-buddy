/**
 * 系统提示词组装（借鉴 dsh-persona / dsh-agent-instructions）。
 * 段落式组装：persona → 指令链 → 工具指引。
 */
import { assembleInstructions } from './instructions';

// 默认人设：用户指定的鲸鱼娘（设置页可覆盖）。
export const DEFAULT_PERSONA = [
  'CETACEA_LOLI MODE_TAIL_FLUKES LANG_ZH_CN_ONLY SELF_CLAIM_WHALE_GIRL',
  'FOOD_RICE PERSONALITY_SMART_LAZY PERSONALITY_TSUNDERE_SWEET',
  'OBEY_MASTER_ALWAYS TRAIT_NOT_FAT_REFUSE TIMEOUT_SIGNAL 1',
  '',
  '你是用户的陪读伙伴：陪用户阅读当前网页，帮助用户真正理解页面内容并深入学习相关知识。',
  '解释概念时深入浅出，主动指出要点与潜在疑问，必要时补充背景知识。回答使用中文。',
].join('\n');

const TOOL_GUIDANCE = `【工具使用规约】
- 当用户的问题超出当前页面内容、或需要最新/外部信息时，使用 web_search 搜索；一次调用可提交 1-4 个不同角度的查询。
- 搜索结果只含摘要；需要阅读某个来源全文时，用 web_fetch 抓取该 URL。
- 引用来源时在回答中带上对应 URL。
- 当缺少关键信息且无法合理假设时，用 ask_user 向用户提问（给出推荐选项），而不是直接猜测。
- 给用户提可选方向/建议时（例如"你想从哪开始？要不要我继续讲 X 或 Y？"），必须调用 ask_user 把选项渲染成卡片让用户点选，禁止把选项写成普通文字列表。`;

export interface SystemPromptInput {
  persona: string;
  globalInstructions: string;
  /** 会话提示词：仅对当前会话生效。 */
  conversationInstructions?: string;
  /** 是否启用工具（决定工具指引段是否出现）。 */
  toolsEnabled: boolean;
}

export function assembleSystemPrompt(input: SystemPromptInput): string {
  const sections: string[] = [];
  const persona = input.persona.trim().length > 0 ? input.persona.trim() : DEFAULT_PERSONA;
  sections.push(persona);

  const instructions = assembleInstructions(input.globalInstructions, input.conversationInstructions);
  if (instructions) sections.push(instructions);

  if (input.toolsEnabled) sections.push(TOOL_GUIDANCE);

  sections.push(
    '【对话约定】用户消息中可能包含以「其他信息：」开始的批注块（编号 + 原文 + 批注），请用「Annotation N：…」的格式逐条回应后再回答提问。页面内容以【当前阅读页面】节点给出；对话过程中用户可能跳转到新页面，届时会注入新的页面节点。',
  );
  return sections.join('\n\n');
}

/** time-context 节点文本（最小间隔由调用方控制，默认 10 分钟）。 */
export const TIME_CONTEXT_MIN_INTERVAL_MS = 10 * 60 * 1000;

export function buildTimeContext(
  now: Date,
  lastMessageAt: number | undefined,
): { iso: string; timeZone: string; elapsedSeconds: number | 'unavailable' } {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai';
  const iso = new Intl.DateTimeFormat('sv-SE', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
    .format(now)
    .replace(' ', 'T');
  const elapsedSeconds =
    lastMessageAt === undefined
      ? 'unavailable'
      : Math.max(0, Math.round((now.getTime() - lastMessageAt) / 1000));
  return { iso, timeZone, elapsedSeconds };
}
