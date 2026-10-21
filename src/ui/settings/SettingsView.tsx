/**
 * 设置页：API key / 端点 / 模型 / 思考模式 / persona / 指令（全局 + per-origin）。
 * API key 仅存 chrome.storage.local，从不上 sync。
 */
import { useEffect, useState } from 'react';
import type { ModelId, Settings } from '../../types';
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
          ←
        </button>
        <div className="dr-chat-title">设置</div>
        <span />
      </header>
      <div className="dr-settings-body">
        <label className="dr-field">
          <span>DeepSeek API Key（仅存本地，不会同步到云端）</span>
          <input
            type="password"
            value={settings.apiKey}
            onChange={(e) => patch({ apiKey: e.target.value.trim() })}
            placeholder="sk-…"
          />
        </label>
        <label className="dr-field">
          <span>API 基址（兼容代理/网关）</span>
          <input value={settings.baseURL} onChange={(e) => patch({ baseURL: e.target.value })} />
        </label>
        <label className="dr-field">
          <span>Search / Fetch 工具端点</span>
          <input
            value={settings.toolsBaseURL}
            onChange={(e) => patch({ toolsBaseURL: e.target.value })}
          />
        </label>
        <label className="dr-field">
          <span>模型</span>
          <select
            value={settings.model}
            onChange={(e) => patch({ model: e.target.value as ModelId })}
          >
            <option value="deepseek-flash">deepseek-flash（快，支持视觉）</option>
            <option value="deepseek-v4-pro">deepseek-v4-pro（更深，更贵）</option>
          </select>
        </label>
        <label className="dr-field dr-field-inline">
          <input
            type="checkbox"
            checked={settings.thinkingEnabled}
            onChange={(e) => patch({ thinkingEnabled: e.target.checked })}
          />
          <span>默认开启思考模式</span>
        </label>
        <label className="dr-field">
          <span>思考强度</span>
          <select
            value={settings.reasoningEffort}
            onChange={(e) =>
              patch({ reasoningEffort: e.target.value as Settings['reasoningEffort'] })
            }
          >
            <option value="low">low（快）</option>
            <option value="high">high（默认）</option>
            <option value="max">max（最深）</option>
          </select>
        </label>
        <label className="dr-field">
          <span>陪读人设（persona，留空用默认）</span>
          <textarea
            rows={3}
            value={settings.persona}
            placeholder="例：你是我的经济学导师，解释概念时结合实例。"
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
        <label className="dr-field">
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
        <button className="dr-primary-btn" onClick={() => void save()}>
          {saved ? '已保存 ✓' : '保存'}
        </button>
      </div>
    </div>
  );
}
