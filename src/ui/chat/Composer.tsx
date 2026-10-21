/**
 * 输入区：批注 chip 列表 + 文本框 + 思考模式开关 + 发送/停止。
 * IME 安全：Enter 发送带 isComposing 守卫；Shift+Enter 换行。
 */
import { useState, type KeyboardEvent } from 'react';
import type { AnnotationItem } from '../../types';

interface Props {
  question: string;
  annotations: AnnotationItem[];
  thinkingEnabled: boolean;
  running: boolean;
  onQuestionChange: (q: string) => void;
  onAnnotationsChange: (items: AnnotationItem[]) => void;
  onThinkingChange: (enabled: boolean) => void;
  onSend: () => void;
  onCancel: () => void;
}

export function Composer(props: Props) {
  const [showAnnotations, setShowAnnotations] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editNote, setEditNote] = useState('');

  const canSend = !props.running && (props.question.trim().length > 0 || props.annotations.length > 0);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // IME 组词中不触发发送（isComposing / keyCode 229 守卫）。
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) {
      e.preventDefault();
      if (canSend) props.onSend();
    }
  };

  const updateNote = (index: number, note: string) => {
    props.onAnnotationsChange(
      props.annotations.map((a) => (a.index === index ? { ...a, note } : a)),
    );
  };

  return (
    <div className="dr-composer">
      {props.annotations.length > 0 && (
        <div className="dr-anno-bar">
          <button className="dr-chip" onClick={() => setShowAnnotations((v) => !v)}>
            批注 ×{props.annotations.length}
          </button>
          {showAnnotations && (
            <div className="dr-anno-list">
              {props.annotations.map((a) => (
                <div key={a.index} className="dr-anno-item">
                  <div className="dr-anno-quote" title={a.quote}>
                    #{a.index} 「{a.quote.length > 60 ? `${a.quote.slice(0, 60)}…` : a.quote}」
                  </div>
                  {editingIndex === a.index ? (
                    <input
                      autoFocus
                      value={editNote}
                      placeholder="写点批注…"
                      onChange={(e) => setEditNote(e.target.value)}
                      onBlur={() => {
                        updateNote(a.index, editNote);
                        setEditingIndex(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                          updateNote(a.index, editNote);
                          setEditingIndex(null);
                        }
                      }}
                    />
                  ) : (
                    <button
                      className="dr-icon-btn"
                      onClick={() => {
                        setEditingIndex(a.index);
                        setEditNote(a.note);
                      }}
                    >
                      {a.note || '添加批注'}
                    </button>
                  )}
                  <button
                    className="dr-icon-btn"
                    title="删除"
                    onClick={() =>
                      props.onAnnotationsChange(
                        props.annotations
                          .filter((x) => x.index !== a.index)
                          .map((x, i) => ({ ...x, index: i + 1 })),
                      )
                    }
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      <textarea
        className="dr-input"
        placeholder="就当前页面提问…（选中页面或对话文字可添加批注）"
        value={props.question}
        rows={3}
        onChange={(e) => props.onQuestionChange(e.target.value)}
        onKeyDown={handleKeyDown}
      />
      <div className="dr-composer-footer">
        <label className="dr-thinking-toggle" title="思考模式：先输出思维链再给答案，更深入但更慢">
          <input
            type="checkbox"
            checked={props.thinkingEnabled}
            onChange={(e) => props.onThinkingChange(e.target.checked)}
          />
          思考模式
        </label>
        {props.running ? (
          <button className="dr-icon-btn" onClick={props.onCancel}>
            ■ 停止
          </button>
        ) : (
          <button className="dr-primary-btn" disabled={!canSend} onClick={props.onSend}>
            发送
          </button>
        )}
      </div>
    </div>
  );
}
