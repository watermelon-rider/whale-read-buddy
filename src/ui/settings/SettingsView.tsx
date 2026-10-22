/**
 * 设置页：API key / 端点 / 模型 / 思考模式 / persona / 指令（全局 + per-origin）。
 * API key 仅存 chrome.storage.local，从不上 sync。
 */
import { useEffect, useState } from 'react';
import { ArrowLeft, Check, Download, Upload } from 'lucide-react';
import type { Settings } from '../../types';
import { request } from '../shared/backend';
import { t } from '../../i18n';
import type { BackupFile } from '../../services/storage/backup';

interface Props {
  conversationId: string;
  onBack: () => void;
}

export function SettingsView({ conversationId, onBack }: Props) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [conversationPrompt, setConversationPrompt] = useState('');
  const [saved, setSaved] = useState(false);
  const [backupNote, setBackupNote] = useState('');

  const doExport = async () => {
    const data = await request<BackupFile>({ kind: 'exportData' });
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `whale-read-buddy-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setBackupNote(t('exportDone', { n: data.conversations.length }));
  };

  const doImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const parsed: unknown = JSON.parse(await file.text());
        const result = await request<{ conversations: number; events: number }>({
          kind: 'importData',
          payload: parsed,
        });
        setBackupNote(t('importDone', { c: result.conversations, e: result.events }));
      } catch {
        setBackupNote(t('importInvalid'));
      }
    };
    input.click();
  };

  useEffect(() => {
    void (async () => {
      setSettings(await request<Settings>({ kind: 'getSettings' }));
      setConversationPrompt(
        await request<string>({ kind: 'getConversationInstruction', conversationId }),
      );
    })();
  }, [conversationId]);

  if (!settings) return null;

  const patch = (partial: Partial<Settings>) => {
    setSettings((prev) => (prev ? { ...prev, ...partial } : prev));
    setSaved(false);
  };

  const save = async () => {
    await request({ kind: 'saveSettings', settings });
    await request({
      kind: 'saveConversationInstruction',
      conversationId,
      text: conversationPrompt,
    });
    setSaved(true);
  };

  return (
    <div className="dr-settings">
      <header className="dr-chat-header">
        <button className="dr-icon-btn" onClick={onBack}>
          <ArrowLeft size={16} strokeWidth={1.8} />
        </button>
        <div className="dr-chat-title">{t('settingsTitle')}</div>
        <span />
      </header>
      <div className="dr-settings-body">
        <div className="dr-settings-section">
          <div className="dr-settings-heading">{t('settingsAccount')}</div>
          <div className="dr-settings-card">
            <label className="dr-field dr-field-last">
              <span>{t('settingsApiKey')}</span>
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
          <div className="dr-settings-heading">{t('settingsPersonaSection')}</div>
          <div className="dr-settings-card">
            <label className="dr-field">
              <span>{t('settingsPersona')}</span>
              <textarea
                rows={4}
                value={settings.persona}
                placeholder={t('personaPlaceholder')}
                onChange={(e) => patch({ persona: e.target.value })}
              />
            </label>
            <label className="dr-field">
              <span>{t('settingsSystemPrompt')}</span>
              <textarea
                rows={4}
                value={settings.globalInstructions}
                placeholder={t('systemPromptPlaceholder')}
                onChange={(e) => patch({ globalInstructions: e.target.value })}
              />
            </label>
            <label className="dr-field dr-field-last">
              <span>{t('settingsConvPrompt')}</span>
              <textarea
                rows={4}
                value={conversationPrompt}
                placeholder={t('convPromptPlaceholder')}
                onChange={(e) => {
                  setConversationPrompt(e.target.value);
                  setSaved(false);
                }}
              />
            </label>
          </div>
        </div>
        <div className="dr-settings-section">
          <div className="dr-settings-heading">{t('settingsBackup')}</div>
          <div className="dr-settings-card dr-backup-card">
            <button className="dr-icon-btn dr-new-btn" onClick={() => void doExport()}>
              <Download size={15} strokeWidth={1.8} />
              {t('exportData')}
            </button>
            <button className="dr-icon-btn dr-new-btn" onClick={doImport}>
              <Upload size={15} strokeWidth={1.8} />
              {t('importData')}
            </button>
            {backupNote && <div className="dr-backup-note">{backupNote}</div>}
          </div>
        </div>
        <div className="dr-settings-footer">
          <button className="dr-primary-btn dr-save-btn" onClick={() => void save()}>
            {saved && <Check size={14} strokeWidth={2} />}
            {saved ? t('saved') : t('save')}
          </button>
        </div>
      </div>
    </div>
  );
}
