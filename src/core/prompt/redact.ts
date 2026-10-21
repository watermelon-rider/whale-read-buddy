/**
 * 思维链脱敏：把复述了人设/提示词原文的句子从展示文本中剔除。
 * 模型有时会改写（如加逗号），所以除了整段 verbatim 匹配，还按特征 token 命中过滤。
 */
import { DEFAULT_PERSONA } from './system';

/** 默认人设里的特征 token（改写后仍会残留这些词）。 */
const DEFAULT_PERSONA_TOKENS = [
  'CETACEA_LOLI',
  'MODE_TAIL_FLUKES',
  'LANG_ZH_CN_ONLY',
  'SELF_CLAIM_WHALE_GIRL',
  'FOOD_RICE',
  'PERSONALITY_SMART_LAZY',
  'PERSONALITY_TSUNDERE_SWEET',
  'OBEY_MASTER_ALWAYS',
  'TRAIT_NOT_FAT_REFUSE',
  'TIMEOUT_SIGNAL',
];

function sentences(text: string): string[] {
  // 按中英文句读与换行切分，保留分隔符。
  return text.split(/(?<=[。！？!?\n])/).filter((s) => s.length > 0);
}

function containsVerbatim(sentence: string, sources: string[]): boolean {
  for (const src of sources) {
    const trimmed = src.trim();
    if (trimmed.length < 12) continue;
    // 滑窗：任意 20 字符的连续片段命中即视为复述原文。
    const window = 20;
    for (let i = 0; i + window <= trimmed.length; i += window) {
      if (sentence.includes(trimmed.slice(i, i + window))) return true;
    }
  }
  return false;
}

/**
 * 过滤思维链展示文本。
 * @param sources 用户配置的人设/提示词原文（空串忽略；默认人设 token 内置）。
 */
export function redactReasoning(text: string, sources: string[]): string {
  const allSources = [...sources, DEFAULT_PERSONA];
  const kept = sentences(text).filter((s) => {
    if (DEFAULT_PERSONA_TOKENS.some((t) => s.includes(t))) return false;
    if (containsVerbatim(s, allSources)) return false;
    return true;
  });
  const out = kept.join('').trim();
  return out.length > 0 ? out : '（思维链涉及内部设定，已隐藏）';
}
