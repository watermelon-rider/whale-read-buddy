/**
 * ask_user 工具的内嵌问题卡片（借鉴 dsh-tool-ask-user，阻塞模式）。
 */
import { useState } from 'react';
import type { AskUserQuestion } from '../../core/agent/tools';

interface Props {
  questions: AskUserQuestion[];
  onSubmit: (answers: Record<string, string>) => void;
}

export function AskUserCard({ questions, onSubmit }: Props) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [custom, setCustom] = useState<Record<string, string>>({});

  return (
    <div className="dr-ask-card">
      <div className="dr-ask-title">大肥鱼想问你：</div>
      {questions.map((q) => (
        <div key={q.id} className="dr-ask-question">
          {q.header && <div className="dr-ask-header">{q.header}</div>}
          <div className="dr-ask-text">{q.question}</div>
          <div className="dr-ask-options">
            {q.options.map((opt) => (
              <button
                key={opt.label}
                className={`dr-ask-option${answers[q.id] === opt.label ? ' selected' : ''}`}
                title={opt.description}
                onClick={() => setAnswers((prev) => ({ ...prev, [q.id]: opt.label }))}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <input
            className="dr-ask-custom"
            placeholder="或者输入其他回答…"
            value={custom[q.id] ?? ''}
            onChange={(e) => {
              const v = e.target.value;
              setCustom((prev) => ({ ...prev, [q.id]: v }));
              if (v.trim().length > 0) setAnswers((prev) => ({ ...prev, [q.id]: v }));
            }}
          />
        </div>
      ))}
      <button className="dr-primary-btn" onClick={() => onSubmit(answers)}>
        提交回答
      </button>
    </div>
  );
}
