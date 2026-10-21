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
  const annoAnchorRef = useRef<HTMLDivElement>(null);
  const modelAnchorRef = useRef<HTMLDivElement>(null);

  // 失焦（点击弹层外部）关闭两个菜单。
  useEffect(() => {
    const onDown = (e: globalThis.MouseEvent) => {
      const target = e.target as Node;
      if (showAnnotations && annoAnchorRef.current && !annoAnchorRef.current.contains(target)) {
        setShowAnnotations(false);
        setEditingIndex(null);
      }
      if (showModelMenu && modelAnchorRef.current && !modelAnchorRef.current.contains(target)) {
        setShowModelMenu(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [showAnnotations, showModelMenu]);

  const canSend =
    !props.running && (props.question.trim().length > 0 || props.annotations.length > 0);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // IME 组词中不触发发送（isComposing / keyCode 229 守卫）。
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) {
      e.preventDefault();
      if (canSend) props.onSend();
    }
  };

  // 自动高度：最多占内容窗口（面板）高度的一半。
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    // 空内容时按单行（placeholder 换行不应撑高输入框）。
    if (props.question.length === 0) {
      ta.style.height = '';
      return;
    }
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, Math.floor(window.innerHeight * 0.5))}px`;
  }, [props.question]);

  const updateNote = (index: number, note: string) => {
    props.onAnnotationsChange(
      props.annotations.map((a) => (a.index === index ? { ...a, note } : a)),
    );
  };

  return (
    <div className="dr-composer-card">
      {props.annotations.length > 0 && (
        <div className="dr-anno-anchor dr-anno-top" ref={annoAnchorRef}>
          <button
            className="dr-anno-chip dr-anno-chip-filled"
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
                    <span className="dr-anno-quote-text">
                      #{a.index}「{a.quote.length > 50 ? `${a.quote.slice(0, 50)}…` : a.quote}」
                    </span>
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
                  <div className="dr-anno-note-row">
                    {editingIndex === a.index ? (
                      <textarea
                        autoFocus
                        className="dr-anno-edit dr-anno-edit-area"
                        value={editNote}
                        placeholder="写点批注…"
                        rows={1}
                        ref={(el) => {
                          if (el) {
                            el.style.height = 'auto';
                            el.style.height = `${Math.min(el.scrollHeight, 66)}px`;
                          }
                        }}
                        onChange={(e) => {
                          setEditNote(e.target.value);
                          e.target.style.height = 'auto';
                          e.target.style.height = `${Math.min(e.target.scrollHeight, 66)}px`;
                        }}
                        onBlur={() => {
                          updateNote(a.index, editNote.trim());
                          setEditingIndex(null);
                        }}
                        onKeyDown={(e) => {
                          if (
                            e.key === 'Enter' &&
                            !e.shiftKey &&
                            !e.nativeEvent.isComposing &&
                            e.keyCode !== 229
                          ) {
                            e.preventDefault();
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
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      <textarea
        ref={textareaRef}
        className="dr-input"
        placeholder="给大肥鱼发消息…"
        value={props.question}
        rows={1}
        onChange={(e) => props.onQuestionChange(e.target.value)}
        onKeyDown={handleKeyDown}
      />
      <div className="dr-composer-footer">
        <div className="dr-footer-left" />
        <div className="dr-footer-right">
          <div className="dr-model-anchor" ref={modelAnchorRef}>
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
