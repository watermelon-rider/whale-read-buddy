/**
 * 设置页：API key / 端点 / 模型 / 思考模式 / persona / 指令（全局 + per-origin）。
 * API key 仅存 chrome.storage.local，从不上 sync。
 */
import { useEffect, useState } from 'react';
import { ArrowLeft, Check } from 'lucide-react';
import type { Settings } from '../../types';
import { request } from '../shared/backend';

interface Props {
  currentOrigin: string;
  onBack: () => void;
}

export function SettingsView({ currentOrigin, onBack }: Props) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [siteInstruction, setSiteInstruction] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void (async () => {
      setSettings(await request<Settings>({ kind: 'getSettings' }));
      setSiteInstruction(
        await request<string>({ kind: 'getSiteInstruction', origin: currentOrigin }),
      );
    })();
  }, [currentOrigin]);

  if (!settings) return null;

  const patch = (partial: Partial<Settings>) => {
    setSettings((prev) => (prev ? { ...prev, ...partial } : prev));
    setSaved(false);
  };

  const save = async () => {
    await request({ kind: 'saveSettings', settings });
    await request({ kind: 'saveSiteInstruction', origin: currentOrigin, text: siteInstruction });
    setSaved(true);
  };

  return (
    <div className="dr-settings">
      <header className="dr-chat-header">
        <button className="dr-icon-btn" onClick={onBack}>
          <ArrowLeft size={16} strokeWidth={1.8} />
        </button>
        <div className="dr-chat-title">设置</div>
        <span />
      </header>
      <div className="dr-settings-body">
        <div className="dr-settings-section">
          <div className="dr-settings-heading">账号</div>
          <div className="dr-settings-card">
            <label className="dr-field dr-field-last">
              <span>DeepSeek API Key · 仅存本地，不会同步到云端</span>
              <input
                type="password"
                value={settings.apiKey}
                onChange={(e) => patch({ apiKey: e.target.value.trim() })}
                placeholder="sk-…"
              />
            </label>
          </div>
        </div>
        <div className="dr-settings-section">
          <div className="dr-settings-heading">人设与指令</div>
          <div className="dr-settings-card">
            <label className="dr-field">
              <span>陪读人设（留空用默认）</span>
              <textarea
                rows={4}
                value={settings.persona}
                placeholder="留空则使用默认人设"
                onChange={(e) => patch({ persona: e.target.value })}
              />
            </label>
            <label className="dr-field">
              <span>全局阅读指令（对所有站点生效）</span>
              <textarea
                rows={3}
                value={settings.globalInstructions}
                placeholder="例：回答时先给结论，再展开论证。"
                onChange={(e) => patch({ globalInstructions: e.target.value })}
              />
            </label>
            <label className="dr-field dr-field-last">
              <span>站点指令（仅 {currentOrigin}）</span>
              <textarea
                rows={3}
                value={siteInstruction}
                placeholder="例：知乎的回答先关注赞同数与评论区争议。"
                onChange={(e) => {
                  setSiteInstruction(e.target.value);
                  setSaved(false);
                }}
              />
            </label>
          </div>
        </div>
        <div className="dr-settings-footer">
          <button className="dr-primary-btn dr-save-btn" onClick={() => void save()}>
            {saved && <Check size={14} strokeWidth={2} />}
            {saved ? '已保存' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}
