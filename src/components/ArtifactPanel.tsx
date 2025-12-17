'use client';

import React, { useState } from 'react';
import { X, Eye, Code, Copy, Check, Download, RefreshCw, ExternalLink, ChevronDown } from 'lucide-react';
import { Artifact } from '@/types';

interface ArtifactPanelProps {
  artifact: Artifact | null;
  onClose: () => void;
  onRefresh?: () => void;
}

export default function ArtifactPanel({ artifact, onClose, onRefresh }: ArtifactPanelProps) {
  const [viewMode, setViewMode] = useState<'preview' | 'code'>('preview');
  const [copied, setCopied] = useState(false);
  const [showCopyMenu, setShowCopyMenu] = useState(false);

  if (!artifact) return null;

  const canPreview = ['html', 'svg', 'mermaid', 'react'].includes(artifact.type);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(artifact.content);
      setCopied(true);
    } catch (error) {
      // Fallback for browsers without clipboard API
      const textArea = document.createElement('textarea');
      textArea.value = artifact.content;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
    }
    setShowCopyMenu(false);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const ext = getExtension(artifact.type, artifact.language);
    const blob = new Blob([artifact.content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${artifact.name || 'artifact'}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
    setShowCopyMenu(false);
  };

  const handleOpenInNewTab = () => {
    if (artifact.type === 'html' || artifact.type === 'react') {
      const blob = new Blob([artifact.content], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
    } else if (artifact.type === 'svg') {
      const blob = new Blob([artifact.content], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
    }
    setShowCopyMenu(false);
  };

  return (
    <div className="h-full flex flex-col bg-[var(--claude-surface)] border-l border-[var(--claude-border)] animate-slide-in-right">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--claude-border)]">
        <div className="flex items-center gap-3">
          {/* Back button */}
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[var(--claude-sand-light)] text-[var(--claude-text-secondary)] transition-colors"
          >
            <ChevronDown className="w-4 h-4 rotate-90" />
          </button>

          {/* View toggle */}
          {canPreview && (
            <div className="flex items-center rounded-lg bg-[var(--claude-surface-sunken)] p-1">
              <button
                onClick={() => setViewMode('preview')}
                className={`p-1.5 rounded-md transition-colors ${
                  viewMode === 'preview'
                    ? 'bg-[var(--claude-surface)] shadow-sm'
                    : 'text-[var(--claude-text-muted)] hover:text-[var(--claude-text)]'
                }`}
                title="Preview"
              >
                <Eye className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('code')}
                className={`p-1.5 rounded-md transition-colors ${
                  viewMode === 'code'
                    ? 'bg-[var(--claude-surface)] shadow-sm'
                    : 'text-[var(--claude-text-muted)] hover:text-[var(--claude-text)]'
                }`}
                title="Code"
              >
                <Code className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* File name */}
          <span className="text-sm text-[var(--claude-text-secondary)]">
            {artifact.name}
            <span className="text-[var(--claude-text-muted)]">
              {' · '}
              {artifact.language?.toUpperCase() || artifact.type.toUpperCase()}
            </span>
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Copy dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowCopyMenu(!showCopyMenu)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-[var(--claude-text-secondary)] hover:bg-[var(--claude-sand-light)] transition-colors"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4 text-[var(--claude-success)]" />
                  Copied
                </>
              ) : (
                <>
                  Copy
                  <ChevronDown className="w-3 h-3" />
                </>
              )}
            </button>

            {showCopyMenu && (
              <div className="absolute right-0 top-full mt-1 w-44 py-1 rounded-xl bg-[var(--claude-surface)] border border-[var(--claude-border)] shadow-lg z-10">
                <button
                  onClick={handleCopy}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--claude-text)] hover:bg-[var(--claude-sand-light)]"
                >
                  <Copy className="w-4 h-4" />
                  Copy code
                </button>
                <button
                  onClick={handleDownload}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--claude-text)] hover:bg-[var(--claude-sand-light)]"
                >
                  <Download className="w-4 h-4" />
                  Download
                </button>
                {canPreview && (
                  <button
                    onClick={handleOpenInNewTab}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--claude-text)] hover:bg-[var(--claude-sand-light)]"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Open in new tab
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Refresh */}
          {onRefresh && (
            <button
              onClick={onRefresh}
              className="p-1.5 rounded-lg hover:bg-[var(--claude-sand-light)] text-[var(--claude-text-secondary)] transition-colors"
              title="Refresh"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          )}

          {/* Close */}
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[var(--claude-sand-light)] text-[var(--claude-text-secondary)] transition-colors"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {viewMode === 'preview' && canPreview ? (
          <ArtifactPreview artifact={artifact} />
        ) : (
          <pre className="p-4 text-sm font-mono text-[var(--claude-text)] whitespace-pre-wrap leading-relaxed">
            {artifact.content}
          </pre>
        )}
      </div>
    </div>
  );
}

function ArtifactPreview({ artifact }: { artifact: Artifact }) {
  if (artifact.type === 'svg') {
    return (
      <div
        className="w-full h-full flex items-center justify-center p-4"
        dangerouslySetInnerHTML={{ __html: artifact.content }}
      />
    );
  }

  if (artifact.type === 'html' || artifact.type === 'react') {
    return (
      <iframe
        srcDoc={artifact.content}
        className="w-full h-full border-none"
        sandbox="allow-scripts"
        title={artifact.name}
      />
    );
  }

  if (artifact.type === 'mermaid') {
    // For mermaid, we'd need to integrate mermaid.js
    // For now, show as code
    return (
      <pre className="p-4 text-sm font-mono text-[var(--claude-text)] whitespace-pre-wrap">
        {artifact.content}
      </pre>
    );
  }

  return (
    <pre className="p-4 text-sm font-mono text-[var(--claude-text)] whitespace-pre-wrap">
      {artifact.content}
    </pre>
  );
}

function getExtension(type: string, language?: string): string {
  if (language) {
    const langMap: Record<string, string> = {
      typescript: 'ts',
      javascript: 'js',
      python: 'py',
      tsx: 'tsx',
      jsx: 'jsx',
    };
    return langMap[language] || language;
  }

  const typeMap: Record<string, string> = {
    html: 'html',
    svg: 'svg',
    mermaid: 'mmd',
    react: 'tsx',
    markdown: 'md',
    code: 'txt',
  };
  return typeMap[type] || 'txt';
}
