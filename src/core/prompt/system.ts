/**
 * 系统提示词组装（借鉴 dsh-persona / dsh-agent-instructions）。
 * 段落式组装：persona → 指令链 → 工具指引。
 * 文案跟随浏览器 UI 语言（src/i18n）。
 */
import { t } from '../../i18n';
import { assembleInstructions } from './instructions';

// 默认人设：用户指定的鲸鱼娘（设置页可覆盖）。语言锁定跟随浏览器语言。
export function defaultPersona(): string {
  return [
    t('personaLine1'),
    t('personaLine2'),
    t('personaLine3'),
    '',
    t('personaRole'),
  ].join('\n');
}

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
  const persona = input.persona.trim().length > 0 ? input.persona.trim() : defaultPersona();
  sections.push(persona);

  const instructions = assembleInstructions(input.globalInstructions, input.conversationInstructions);
  if (instructions) sections.push(instructions);

  if (input.toolsEnabled) sections.push(t('toolGuidance'));

  sections.push(
    t('dialogConventions'),
    t('secrecyConventions'),
    t('formatConventions'),
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
