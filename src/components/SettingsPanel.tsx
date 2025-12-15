'use client';

import React, { useState } from 'react';
import { X, Shield, Zap, Globe, Brain, Gauge, DollarSign, Moon, Sun, Terminal, Database, FileUp, Key, Eye, EyeOff, Check, LogOut, Github } from 'lucide-react';
import { Settings, ModelType, EffortLevel, WebSearchMode, MODEL_DISPLAY_NAMES } from '@/types';

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  settings: Settings;
  onSettingsChange: (settings: Settings) => void;
  darkMode: boolean;
  onDarkModeChange: (dark: boolean) => void;
  anthropicKey?: string;
  githubToken?: string;
  githubUser?: string;
  onAnthropicKeyChange?: (key: string) => void;
  onGithubTokenChange?: (token: string) => void;
  onLogout?: () => void;
}

export default function SettingsPanel({
  isOpen,
  onClose,
  settings,
  onSettingsChange,
  darkMode,
  onDarkModeChange,
  anthropicKey = '',
  githubToken = '',
  githubUser = '',
  onAnthropicKeyChange,
  onGithubTokenChange,
  onLogout,
}: SettingsPanelProps) {
  const [showAnthropicKey, setShowAnthropicKey] = useState(false);
  const [showGithubToken, setShowGithubToken] = useState(false);

  if (!isOpen) return null;

  const updateSetting = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    onSettingsChange({ ...settings, [key]: value });
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="relative w-full max-w-md h-full bg-[var(--claude-surface)] border-l border-[var(--claude-border)] flex flex-col animate-slide-in-right">
        {/* Header - flex-shrink-0 */}
        <div className="flex-shrink-0 flex items-center justify-between px-6 py-5 border-b border-[var(--claude-border)]">
          <h2 className="text-xl font-serif text-[var(--claude-text)]">Settings</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-[var(--claude-sand-light)] text-[var(--claude-text-secondary)] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body - flex-1 overflow-y-auto */}
        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          {/* Deploy Mode */}
          <SettingSection
            icon={<Shield className="w-5 h-5" />}
            title="Deploy Mode"
            description="Choose how changes are pushed to GitHub"
          >
            <div className="grid grid-cols-2 gap-3">
              <ModeButton
                active={settings.deployMode === 'safe'}
                onClick={() => updateSetting('deployMode', 'safe')}
                label="Safe Mode"
                description="Creates PR for review"
                color="success"
              />
              <ModeButton
                active={settings.deployMode === 'direct'}
                onClick={() => updateSetting('deployMode', 'direct')}
                label="Direct Mode"
                description="Push to main"
                color="warning"
              />
            </div>

            {/* Railway Service Name for Preview URLs */}
            <div className="mt-4">
              <label className="block text-sm font-medium text-[var(--claude-text-secondary)] mb-2">
                Railway Service Name
                <span className="text-[var(--claude-text-muted)]"> (for preview URLs)</span>
              </label>
              <input
                type="text"
                value={settings.railwayServiceName || ''}
                onChange={(e) => updateSetting('railwayServiceName', e.target.value)}
                placeholder="my-app-name"
                className="w-full px-3 py-2 rounded-lg bg-[var(--claude-surface-sunken)] border border-[var(--claude-border)] text-[var(--claude-text)] placeholder:text-[var(--claude-text-muted)] focus:outline-none focus:border-[var(--claude-terracotta)] text-sm"
              />
              <p className="mt-1 text-xs text-[var(--claude-text-muted)]">
                Preview URL: https://{'{name}'}-pr-{'{number}'}.up.railway.app
              </p>
            </div>
          </SettingSection>

          {/* Model */}
          <SettingSection
            icon={<Zap className="w-5 h-5" />}
            title="Model"
            description="Select the Claude model to use"
          >
            <div className="space-y-2">
              {(Object.entries(MODEL_DISPLAY_NAMES) as [ModelType, typeof MODEL_DISPLAY_NAMES[ModelType]][]).map(([modelId, info]) => (
                <button
                  key={modelId}
                  onClick={() => updateSetting('model', modelId)}
                  className={`w-full px-4 py-3 rounded-xl text-left transition-all ${
                    settings.model === modelId
                      ? 'bg-[var(--claude-terracotta)] text-white'
                      : 'bg-[var(--claude-surface-sunken)] text-[var(--claude-text)] hover:bg-[var(--claude-sand-light)]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{info.name}</span>
                    <span>{info.cost}</span>
                  </div>
                  <p className={`text-sm ${settings.model === modelId ? 'text-white/80' : 'text-[var(--claude-text-muted)]'}`}>
                    {info.description}
                  </p>
                </button>
              ))}
            </div>
          </SettingSection>

          {/* Effort Level */}
          <SettingSection
            icon={<Gauge className="w-5 h-5" />}
            title="Effort Level"
            description="Controls response depth and thoroughness"
          >
            <div className="grid grid-cols-3 gap-3">
              {(['low', 'medium', 'high'] as EffortLevel[]).map((level) => (
                <button
                  key={level}
                  onClick={() => updateSetting('effort', level)}
                  className={`
                    px-4 py-2.5 rounded-xl text-sm font-medium capitalize transition-all
                    ${settings.effort === level
                      ? 'bg-[var(--claude-terracotta)] text-white'
                      : 'bg-[var(--claude-surface-sunken)] text-[var(--claude-text-secondary)] hover:bg-[var(--claude-sand-light)]'
                    }
                  `}
                >
                  {level}
                </button>
              ))}
            </div>
          </SettingSection>

          {/* Web Search */}
          <SettingSection
            icon={<Globe className="w-5 h-5" />}
            title="Web Search"
            description="Enable searching the web for current information"
          >
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                {(['off', 'manual', 'auto'] as WebSearchMode[]).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => {
                      updateSetting('webSearchMode', mode);
                      updateSetting('enableWebSearch', mode !== 'off');
                    }}
                    className={`px-3 py-2 rounded-xl text-sm font-medium capitalize transition-all ${
                      settings.webSearchMode === mode
                        ? 'bg-[var(--claude-terracotta)] text-white'
                        : 'bg-[var(--claude-surface-sunken)] text-[var(--claude-text-secondary)] hover:bg-[var(--claude-sand-light)]'
                    }`}
                  >
                    {mode}
                  </button>
                ))}
              </div>
              <p className="text-xs text-[var(--claude-text-muted)]">
                {settings.webSearchMode === 'off' && 'Web search disabled'}
                {settings.webSearchMode === 'manual' && 'Only searches when you ask'}
                {settings.webSearchMode === 'auto' && 'Claude decides when to search'}
              </p>
            </div>
          </SettingSection>

          {/* Extended Thinking */}
          <SettingSection
            icon={<Brain className="w-5 h-5" />}
            title="Extended Thinking"
            description="Allow Claude to think through complex problems"
          >
            <Toggle
              checked={settings.enableExtendedThinking}
              onChange={(checked) => updateSetting('enableExtendedThinking', checked)}
              label="Enable extended thinking"
            />
            {settings.enableExtendedThinking && (
              <div className="mt-4">
                <label className="text-sm text-[var(--claude-text-secondary)]">
                  Thinking budget: {settings.thinkingBudget.toLocaleString()} tokens
                </label>
                <input
                  type="range"
                  min={1024}
                  max={32000}
                  step={1024}
                  value={settings.thinkingBudget}
                  onChange={(e) => updateSetting('thinkingBudget', parseInt(e.target.value))}
                  className="w-full mt-2"
                />
              </div>
            )}
            {settings.enableExtendedThinking && (
              <Toggle
                checked={settings.enableInterleavedThinking}
                onChange={(checked) => updateSetting('enableInterleavedThinking', checked)}
                label="Interleaved thinking (think between tool calls)"
                className="mt-3"
              />
            )}
          </SettingSection>

          {/* Context Compaction */}
          <SettingSection
            icon={<Database className="w-5 h-5" />}
            title="Context Compaction"
            description="Auto-summarize old messages to save tokens"
          >
            <Toggle
              checked={settings.enableContextCompaction}
              onChange={(checked) => updateSetting('enableContextCompaction', checked)}
              label="Enable context compaction"
            />
            {settings.enableContextCompaction && (
              <p className="mt-2 text-xs text-[var(--claude-text-muted)]">
                Claude will automatically summarize older tool results to keep the context manageable.
              </p>
            )}
          </SettingSection>

          {/* Code Execution (Beta) */}
          <SettingSection
            icon={<Terminal className="w-5 h-5" />}
            title="Code Execution"
            description="Let Claude run Python code to verify fixes"
          >
            <Toggle
              checked={settings.enableCodeExecution}
              onChange={(checked) => updateSetting('enableCodeExecution', checked)}
              label="Enable code execution (beta)"
            />
            {settings.enableCodeExecution && (
              <p className="mt-2 text-xs text-[var(--claude-text-muted)]">
                50 free hours/day, then $0.05/hour. Claude can run Python in a sandbox.
              </p>
            )}
          </SettingSection>

          {/* Memory (Beta) */}
          <SettingSection
            icon={<Database className="w-5 h-5" />}
            title="Memory"
            description="Store context across conversations"
          >
            <Toggle
              checked={settings.enableMemory}
              onChange={(checked) => updateSetting('enableMemory', checked)}
              label="Enable memory (beta)"
            />
            {settings.enableMemory && (
              <p className="mt-2 text-xs text-[var(--claude-text-muted)]">
                Claude can save/recall info in /memories directory across sessions.
              </p>
            )}
          </SettingSection>

          {/* Files API (Beta) */}
          <SettingSection
            icon={<FileUp className="w-5 h-5" />}
            title="Files API"
            description="Upload files once, use across messages"
          >
            <Toggle
              checked={settings.enableFilesApi}
              onChange={(checked) => updateSetting('enableFilesApi', checked)}
              label="Enable Files API (beta)"
            />
            {settings.enableFilesApi && (
              <p className="mt-2 text-xs text-[var(--claude-text-muted)]">
                Uploaded files are stored and can be referenced across the entire conversation without re-uploading.
              </p>
            )}
          </SettingSection>

          {/* Token Budget */}
          <SettingSection
            icon={<DollarSign className="w-5 h-5" />}
            title="Cost Limits"
            description="Set spending limits to control costs"
          >
            <Toggle
              checked={settings.tokenBudget.enabled}
              onChange={(checked) => updateSetting('tokenBudget', { ...settings.tokenBudget, enabled: checked })}
              label="Enable cost limits"
            />
            {settings.tokenBudget.enabled && (
              <div className="mt-4 space-y-4">
                <div>
                  <label className="text-sm text-[var(--claude-text-secondary)]">
                    Per message: ${settings.tokenBudget.perMessage.toFixed(2)}
                  </label>
                  <input
                    type="range"
                    min={0.1}
                    max={5}
                    step={0.1}
                    value={settings.tokenBudget.perMessage}
                    onChange={(e) => updateSetting('tokenBudget', { ...settings.tokenBudget, perMessage: parseFloat(e.target.value) })}
                    className="w-full mt-2"
                  />
                </div>
                <div>
                  <label className="text-sm text-[var(--claude-text-secondary)]">
                    Per day: ${settings.tokenBudget.perDay.toFixed(2)}
                  </label>
                  <input
                    type="range"
                    min={1}
                    max={50}
                    step={1}
                    value={settings.tokenBudget.perDay}
                    onChange={(e) => updateSetting('tokenBudget', { ...settings.tokenBudget, perDay: parseFloat(e.target.value) })}
                    className="w-full mt-2"
                  />
                </div>
              </div>
            )}
          </SettingSection>

          {/* API Keys */}
          <SettingSection
            icon={<Key className="w-5 h-5" />}
            title="API Keys"
            description="Manage your API credentials"
          >
            <div className="space-y-4">
              {/* Anthropic API Key */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm text-[var(--claude-text-secondary)]">
                    Anthropic API Key
                  </label>
                  <a
                    href="https://console.anthropic.com/settings/keys"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-[var(--claude-terracotta)] hover:underline"
                  >
                    Get key →
                  </a>
                </div>
                <div className="relative">
                  <input
                    type={showAnthropicKey ? 'text' : 'password'}
                    value={anthropicKey}
                    onChange={(e) => onAnthropicKeyChange?.(e.target.value)}
                    placeholder="sk-ant-..."
                    className="w-full px-4 py-2.5 pr-10 rounded-xl bg-[var(--claude-surface-sunken)] border border-[var(--claude-border)] text-[var(--claude-text)] placeholder:text-[var(--claude-text-muted)] focus:outline-none focus:border-[var(--claude-terracotta)] text-sm"
                  />
                  <button
                    onClick={() => setShowAnthropicKey(!showAnthropicKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--claude-text-muted)] hover:text-[var(--claude-text)]"
                  >
                    {showAnthropicKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {anthropicKey && (
                  <p className="text-xs text-[var(--claude-success)] mt-1 flex items-center gap-1">
                    <Check className="w-3 h-3" /> Valid
                  </p>
                )}
              </div>

              {/* GitHub Token */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm text-[var(--claude-text-secondary)]">
                    GitHub Token
                  </label>
                  <a
                    href="https://github.com/settings/tokens"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-[var(--claude-terracotta)] hover:underline"
                  >
                    Get token →
                  </a>
                </div>
                <div className="relative">
                  <input
                    type={showGithubToken ? 'text' : 'password'}
                    value={githubToken}
                    onChange={(e) => onGithubTokenChange?.(e.target.value)}
                    placeholder="ghp_... (optional)"
                    className="w-full px-4 py-2.5 pr-10 rounded-xl bg-[var(--claude-surface-sunken)] border border-[var(--claude-border)] text-[var(--claude-text)] placeholder:text-[var(--claude-text-muted)] focus:outline-none focus:border-[var(--claude-terracotta)] text-sm"
                  />
                  <button
                    onClick={() => setShowGithubToken(!showGithubToken)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--claude-text-muted)] hover:text-[var(--claude-text)]"
                  >
                    {showGithubToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {githubToken && githubUser && (
                  <p className="text-xs text-[var(--claude-success)] mt-1 flex items-center gap-1">
                    <Check className="w-3 h-3" /> Connected as @{githubUser}
                  </p>
                )}
              </div>
            </div>
          </SettingSection>

          {/* Security */}
          <SettingSection
            icon={<Shield className="w-5 h-5" />}
            title="Security"
            description="Manage access and data"
          >
            <div className="space-y-3">
              <p className="text-sm text-[var(--claude-text-muted)]">
                Password is set via APP_PASSWORD environment variable.
              </p>
              <div className="flex gap-2">
                {onLogout && (
                  <button
                    onClick={onLogout}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--claude-surface-sunken)] text-[var(--claude-text-secondary)] hover:bg-[var(--claude-sand-light)] transition-colors text-sm"
                  >
                    <LogOut className="w-4 h-4" />
                    Log Out
                  </button>
                )}
                <button
                  onClick={() => {
                    if (confirm('Clear all stored data? This will remove your conversations and settings.')) {
                      localStorage.clear();
                      window.location.reload();
                    }
                  }}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--claude-error)]/10 text-[var(--claude-error)] hover:bg-[var(--claude-error)]/20 transition-colors text-sm"
                >
                  Clear All Data
                </button>
              </div>
            </div>
          </SettingSection>

          {/* Theme */}
          <SettingSection
            icon={darkMode ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
            title="Theme"
            description="Choose light or dark mode"
          >
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => onDarkModeChange(false)}
                className={`
                  flex items-center justify-center gap-2 px-4 py-3 rounded-xl transition-all
                  ${!darkMode
                    ? 'bg-[var(--claude-terracotta)] text-white'
                    : 'bg-[var(--claude-surface-sunken)] text-[var(--claude-text-secondary)] hover:bg-[var(--claude-sand-light)]'
                  }
                `}
              >
                <Sun className="w-4 h-4" />
                Light
              </button>
              <button
                onClick={() => onDarkModeChange(true)}
                className={`
                  flex items-center justify-center gap-2 px-4 py-3 rounded-xl transition-all
                  ${darkMode
                    ? 'bg-[var(--claude-terracotta)] text-white'
                    : 'bg-[var(--claude-surface-sunken)] text-[var(--claude-text-secondary)] hover:bg-[var(--claude-sand-light)]'
                  }
                `}
              >
                <Moon className="w-4 h-4" />
                Dark
              </button>
            </div>
          </SettingSection>
        </div>

        {/* Footer - flex-shrink-0 */}
        <div className="flex-shrink-0 px-6 py-4 border-t border-[var(--claude-border)]">
          <button
            onClick={onClose}
            className="w-full px-4 py-3 rounded-xl bg-[var(--claude-terracotta)] text-white font-medium hover:bg-[var(--claude-terracotta-hover)] transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

// Helper components

function SettingSection({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-3 mb-3">
        <div className="p-2 rounded-lg bg-[var(--claude-terracotta-subtle)] text-[var(--claude-terracotta)]">
          {icon}
        </div>
        <div>
          <h3 className="font-medium text-[var(--claude-text)]">{title}</h3>
          <p className="text-sm text-[var(--claude-text-muted)]">{description}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  className = '',
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  className?: string;
}) {
  return (
    <label className={`flex items-center justify-between cursor-pointer ${className}`}>
      <span className="text-sm text-[var(--claude-text-secondary)]">{label}</span>
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`
          relative w-11 h-6 rounded-full transition-colors
          ${checked ? 'bg-[var(--claude-terracotta)]' : 'bg-[var(--claude-sand)]'}
        `}
      >
        <span
          className={`
            absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform
            ${checked ? 'left-6' : 'left-1'}
          `}
        />
      </button>
    </label>
  );
}

function ModeButton({
  active,
  onClick,
  label,
  description,
  color,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  description: string;
  color: 'success' | 'warning';
}) {
  const colorClasses = {
    success: active
      ? 'bg-[var(--claude-success)]/10 border-[var(--claude-success)] text-[var(--claude-success)]'
      : 'hover:bg-[var(--claude-success)]/5',
    warning: active
      ? 'bg-[var(--claude-warning)]/10 border-[var(--claude-warning)] text-[var(--claude-warning)]'
      : 'hover:bg-[var(--claude-warning)]/5',
  };

  return (
    <button
      onClick={onClick}
      className={`
        p-4 rounded-xl border text-left transition-all
        ${active ? colorClasses[color] : `border-[var(--claude-border)] ${colorClasses[color]}`}
      `}
    >
      <p className={`font-medium ${active ? '' : 'text-[var(--claude-text)]'}`}>{label}</p>
      <p className="text-xs mt-1 text-[var(--claude-text-muted)]">{description}</p>
    </button>
  );
}
