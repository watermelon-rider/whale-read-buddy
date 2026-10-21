/**
 * Codex 风格输入卡片：圆角卡片内嵌无边框输入区，底行左侧批注 chip，
 * 右侧模型选择器 + 黑色圆形发送按钮。思维链常开（不暴露开关）。
 */
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { ArrowUp, ChevronDown, MessageSquareQuote, Square, X } from 'lucide-react';
import type { AnnotationItem, ModelId, Settings } from '../../types';

export interface ModelChoice {
  model: ModelId;
  reasoningEffort: Settings['reasoningEffort'];
}

const MODEL_OPTIONS: Array<{ choice: ModelChoice; label: string }> = [
  { choice: { model: 'deepseek-flash', reasoningEffort: 'low' }, label: 'deepseek-flash 低' },
  { choice: { model: 'deepseek-flash', reasoningEffort: 'high' }, label: 'deepseek-flash 高' },
  { choice: { model: 'deepseek-flash', reasoningEffort: 'max' }, label: 'deepseek-flash 最深' },
  { choice: { model: 'deepseek-v4-pro', reasoningEffort: 'low' }, label: 'deepseek-v4-pro 低' },
  { choice: { model: 'deepseek-v4-pro', reasoningEffort: 'high' }, label: 'deepseek-v4-pro 高' },
  { choice: { model: 'deepseek-v4-pro', reasoningEffort: 'max' }, label: 'deepseek-v4-pro 最深' },
];

const EFFORT_LABEL: Record<Settings['reasoningEffort'], string> = {
  low: '低',
  high: '高',
  max: '最深',
};

interface Props {
  question: string;
  annotations: AnnotationItem[];
  running: boolean;
  modelChoice: ModelChoice;
  onQuestionChange: (q: string) => void;
  onAnnotationsChange: (items: AnnotationItem[]) => void;
  onModelChoiceChange: (choice: ModelChoice) => void;
  onSend: () => void;
  onCancel: () => void;
}

export function Composer(props: Props) {
  const [showAnnotations, setShowAnnotations] = useState(false);
  const [showModelMenu, setShowModelMenu] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editNote, setEditNote] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const canSend =
    !props.running && (props.question.trim().length > 0 || props.annotations.length > 0);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // IME 组词中不触发发送（isComposing / keyCode 229 守卫）。
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) {
      e.preventDefault();
      if (canSend) props.onSend();
    }
  };

  // 自动高度。
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
  }, [props.question]);

  const updateNote = (index: number, note: string) => {
    props.onAnnotationsChange(
      props.annotations.map((a) => (a.index === index ? { ...a, note } : a)),
    );
  };

  return (
    <div className="dr-composer-card">
      <textarea
        ref={textareaRef}
        className="dr-input"
        placeholder="就当前页面提问…（选中页面或对话文字可添加批注）"
        value={props.question}
        rows={1}
        onChange={(e) => props.onQuestionChange(e.target.value)}
        onKeyDown={handleKeyDown}
      />
      <div className="dr-composer-footer">
        <div className="dr-footer-left">
          {props.annotations.length > 0 && (
            <div className="dr-anno-anchor">
              <button
                className="dr-anno-chip"
                onClick={() => setShowAnnotations((v) => !v)}
                title="查看 / 编辑批注"
              >
                <MessageSquareQuote size={14} strokeWidth={1.8} />
                批注 ×{props.annotations.length}
              </button>
              {showAnnotations && (
                <div className="dr-anno-list">
                  {props.annotations.map((a) => (
                    <div key={a.index} className="dr-anno-item">
                      <div className="dr-anno-quote" title={a.quote}>
                        #{a.index}「{a.quote.length > 50 ? `${a.quote.slice(0, 50)}…` : a.quote}」
                      </div>
                      {editingIndex === a.index ? (
                        <input
                          autoFocus
                          className="dr-anno-edit"
                          value={editNote}
                          placeholder="写点批注…"
                          onChange={(e) => setEditNote(e.target.value)}
                          onBlur={() => {
                            updateNote(a.index, editNote.trim());
                            setEditingIndex(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                              updateNote(a.index, editNote.trim());
                              setEditingIndex(null);
                            }
                            if (e.key === 'Escape') setEditingIndex(null);
                          }}
                        />
                      ) : (
                        <button
                          className="dr-anno-note-btn"
                          onClick={() => {
                            setEditingIndex(a.index);
                            setEditNote(a.note);
                          }}
                        >
                          {a.note || '添加批注'}
                        </button>
                      )}
                      <button
                        className="dr-anno-del"
                        title="删除"
                        onClick={() =>
                          props.onAnnotationsChange(
                            props.annotations
                              .filter((x) => x.index !== a.index)
                              .map((x, i) => ({ ...x, index: i + 1 })),
                          )
                        }
                      >
                        <X size={13} strokeWidth={1.8} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        <div className="dr-footer-right">
          <div className="dr-model-anchor">
            <button
              className="dr-model-btn"
              onClick={() => setShowModelMenu((v) => !v)}
              title="选择模型与思考强度"
            >
              {props.modelChoice.model} {EFFORT_LABEL[props.modelChoice.reasoningEffort]}
              <ChevronDown size={13} strokeWidth={1.8} className="dr-model-caret" />
            </button>
            {showModelMenu && (
              <div className="dr-model-menu">
                {MODEL_OPTIONS.map((opt) => (
                  <button
                    key={opt.label}
                    className={`dr-model-option${
                      opt.choice.model === props.modelChoice.model &&
                      opt.choice.reasoningEffort === props.modelChoice.reasoningEffort
                        ? ' active'
                        : ''
                    }`}
                    onClick={() => {
                      props.onModelChoiceChange(opt.choice);
                      setShowModelMenu(false);
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          {props.running ? (
            <button className="dr-send" onClick={props.onCancel} title="停止">
              <Square size={12} strokeWidth={2} fill="currentColor" />
            </button>
          ) : (
            <button
              className="dr-send"
              disabled={!canSend}
              onClick={props.onSend}
              title="发送（Enter）"
            >
              <ArrowUp size={16} strokeWidth={2} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
