'use client';

import React from 'react';
import { X, Shield, Zap, Database, Brain, Terminal, FileUp, Settings } from 'lucide-react';
import { Settings as SettingsType, EffortLevel, ModelType, MODEL_DISPLAY_NAMES } from '@/types';

interface QuickSettingsProps {
  isOpen: boolean;
  onClose: () => void;
  settings: SettingsType;
  onSettingsChange: (settings: SettingsType) => void;
  onOpenFullSettings: () => void;
}

export default function QuickSettings({
  isOpen,
  onClose,
  settings,
  onSettingsChange,
  onOpenFullSettings,
}: QuickSettingsProps) {
  if (!isOpen) return null;

  const updateSetting = <K extends keyof SettingsType>(key: K, value: SettingsType[K]) => {
    onSettingsChange({ ...settings, [key]: value });
  };

  return (
    <div className="absolute bottom-full left-0 mb-2 w-80 rounded-xl bg-[var(--claude-surface)] border border-[var(--claude-border)] shadow-lg z-50 animate-fade-in-up">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--claude-border)]">
        <div className="flex items-center gap-2">
          <Settings className="w-4 h-4 text-[var(--claude-terracotta)]" />
          <span className="font-medium text-sm text-[var(--claude-text)]">Quick Settings</span>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-[var(--claude-sand-light)] text-[var(--claude-text-muted)]"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Content */}
      <div className="p-4 space-y-5">
        {/* Effort */}
        <div>
          <label className="block text-xs font-medium text-[var(--claude-text-muted)] uppercase tracking-wide mb-2">
            Effort
          </label>
          <div className="grid grid-cols-3 gap-2">
            {(['low', 'medium', 'high'] as EffortLevel[]).map((level) => (
              <button
                key={level}
                onClick={() => updateSetting('effort', level)}
                className={`px-3 py-2 rounded-lg text-xs font-medium capitalize transition-all ${
                  settings.effort === level
                    ? 'bg-[var(--claude-terracotta)] text-white'
                    : 'bg-[var(--claude-surface-sunken)] text-[var(--claude-text-secondary)] hover:bg-[var(--claude-sand-light)]'
                }`}
              >
                {level} {level === 'low' ? '💸' : level === 'medium' ? '💸💸' : '💸💸💸'}
              </button>
            ))}
          </div>
          <p className="text-xs text-[var(--claude-text-muted)] mt-1">
            Controls response depth & thinking budget
          </p>
        </div>

        {/* Deploy Mode */}
        <div>
          <label className="block text-xs font-medium text-[var(--claude-text-muted)] uppercase tracking-wide mb-2">
            Deploy Mode
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => updateSetting('deployMode', 'safe')}
              className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                settings.deployMode === 'safe'
                  ? 'bg-[var(--claude-success)]/10 border border-[var(--claude-success)] text-[var(--claude-success)]'
                  : 'bg-[var(--claude-surface-sunken)] text-[var(--claude-text-secondary)] hover:bg-[var(--claude-sand-light)]'
              }`}
            >
              <Shield className="w-3 h-3" /> Safe (PR)
            </button>
            <button
              onClick={() => updateSetting('deployMode', 'direct')}
              className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                settings.deployMode === 'direct'
                  ? 'bg-[var(--claude-warning)]/10 border border-[var(--claude-warning)] text-[var(--claude-warning)]'
                  : 'bg-[var(--claude-surface-sunken)] text-[var(--claude-text-secondary)] hover:bg-[var(--claude-sand-light)]'
              }`}
            >
              <Zap className="w-3 h-3" /> Direct
            </button>
          </div>
          <p className="text-xs text-[var(--claude-text-muted)] mt-1">
            {settings.deployMode === 'safe'
              ? 'Safe: branch → PR → review'
              : 'Direct: push straight to main'}
          </p>
        </div>

        {/* Divider */}
        <div className="border-t border-[var(--claude-border)]" />

        {/* Saves Money Section */}
        <div>
          <label className="block text-xs font-medium text-[var(--claude-success)] uppercase tracking-wide mb-2">
            💰 Saves Money
          </label>

          <ToggleRow
            checked={settings.enableContextCompaction}
            onChange={(checked) => updateSetting('enableContextCompaction', checked)}
            label="Context Compaction"
            badge="Saves 30-50%"
            description="Summarizes old messages in long chats"
          />

          <ToggleRow
            checked={settings.enableMemory}
            onChange={(checked) => updateSetting('enableMemory', checked)}
            label="Memory"
            badge="Saves 10-20%"
            description="Remembers key facts across sessions"
          />

          <ToggleRow
            checked={settings.enableFilesApi}
            onChange={(checked) => updateSetting('enableFilesApi', checked)}
            label="Files API"
            badge="Saves 80%"
            description="Upload once, reference many times"
          />
        </div>

        {/* Divider */}
        <div className="border-t border-[var(--claude-border)]" />

        {/* Costs More Section */}
        <div>
          <label className="block text-xs font-medium text-[var(--claude-warning)] uppercase tracking-wide mb-2">
            💸 Costs More
          </label>

          <ToggleRow
            checked={settings.enableInterleavedThinking}
            onChange={(checked) => updateSetting('enableInterleavedThinking', checked)}
            label="Interleaved Thinking"
            badge="💸💸 +50-100%"
            description="Re-thinks after each tool result"
          />

          <ToggleRow
            checked={settings.enableCodeExecution}
            onChange={(checked) => updateSetting('enableCodeExecution', checked)}
            label="Code Execution"
            badge="💸💸💸 +$0.05-0.20"
            description="Runs Python/JS in sandbox"
          />
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-[var(--claude-border)]">
        <button
          onClick={onOpenFullSettings}
          className="w-full text-center text-sm text-[var(--claude-terracotta)] hover:underline"
        >
          Open Full Settings →
        </button>
      </div>
    </div>
  );
}

// Toggle row component
function ToggleRow({
  checked,
  onChange,
  label,
  badge,
  description,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  badge: string;
  description: string;
}) {
  return (
    <div className="flex items-start justify-between py-2">
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm text-[var(--claude-text)]">{label}</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--claude-sand-light)] text-[var(--claude-text-muted)]">
            {badge}
          </span>
        </div>
        <p className="text-xs text-[var(--claude-text-muted)]">{description}</p>
      </div>
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 ml-3 ${
          checked ? 'bg-[var(--claude-terracotta)]' : 'bg-[var(--claude-sand)]'
        }`}
      >
        <span
          className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
            checked ? 'left-[18px]' : 'left-0.5'
          }`}
        />
      </button>
    </div>
  );
}
