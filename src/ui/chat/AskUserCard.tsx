/**
 * ask_user 工具的内嵌问题卡片（借鉴 dsh-tool-ask-user，阻塞模式）。
 */
import { useState } from 'react';
import type { AskUserQuestion } from '../../core/agent/tools';
import { t } from '../../i18n';

interface Props {
  questions: AskUserQuestion[];
  onSubmit: (answers: Record<string, string>) => void;
}

export function AskUserCard({ questions, onSubmit }: Props) {
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [custom, setCustom] = useState<Record<string, string>>({});

  const allPicked = questions.every((q) => (picked[q.id] ?? '').trim().length > 0);
  const hasCustom = Object.values(custom).some((v) => v.trim().length > 0);
  /** 提交按钮：还有没点选项的题、或输了文字时显示。 */
  const showSubmit = !allPicked || hasCustom;

  const merged = (): Record<string, string> => {
    const out: Record<string, string> = { ...picked };
    for (const [k, v] of Object.entries(custom)) {
      if (v.trim().length > 0) out[k] = v;
    }
    return out;
  };

  /** 点选项立即作答；全部问题都答完自动提交，不用再点按钮。 */
  const pick = (q: AskUserQuestion, label: string) => {
    const next = { ...picked, [q.id]: label };
    setPicked(next);
    // 全部点选完成且没有正在输入的文字 → 自动提交。
    if (questions.every((x) => (next[x.id] ?? '').trim().length > 0) && !hasCustom) {
      onSubmit({ ...next, ...Object.fromEntries(Object.entries(custom).filter(([, v]) => v.trim())) });
    }
  };

  const LETTERS = ['A', 'B', 'C', 'D'];

  return (
    <div className="dr-ask-card">
      <div className="dr-ask-title">{t('askTitle')}</div>
      {questions.map((q) => (
        <div key={q.id} className="dr-ask-question">
          {q.header && <div className="dr-ask-header">{q.header}</div>}
          <div className="dr-ask-text">{q.question}</div>
          <div className="dr-ask-options">
            {q.options.map((opt, i) => (
              <button
                key={opt.label}
                className={`dr-ask-option${picked[q.id] === opt.label ? ' selected' : ''}`}
                title={opt.description}
                onClick={() => pick(q, opt.label)}
              >
                <span className="dr-ask-marker">{LETTERS[i] ?? i + 1}.</span>
                {opt.label}
              </button>
            ))}
          </div>
          <input
            className="dr-ask-custom"
            placeholder={t('askCustomPlaceholder')}
            value={custom[q.id] ?? ''}
            onChange={(e) => {
              const v = e.target.value;
              setCustom((prev) => ({ ...prev, [q.id]: v }));
            }}
          />
        </div>
      ))}
      {/* 纯选项作答会自动提交；只有文字输入需要点提交 */}
      {showSubmit && (
        <div className="dr-ask-submit-row">
          <button className="dr-primary-btn dr-ask-submit" onClick={() => onSubmit(merged())}>
            {t('askSubmit')}
          </button>
        </div>
      )}
    </div>
  );
}
