'use client';

import React from 'react';
import { Download, FileCode, FileText, Image, Box, GitBranch } from 'lucide-react';
import { Artifact } from '@/types';

interface ArtifactsListProps {
  artifacts: Artifact[];
  onSelect: (artifact: Artifact) => void;
  onDownloadAll: () => void;
}

export default function ArtifactsList({ artifacts, onSelect, onDownloadAll }: ArtifactsListProps) {
  if (artifacts.length === 0) return null;

  const getIcon = (type: string) => {
    switch (type) {
      case 'html':
      case 'react':
        return FileCode;
      case 'svg':
        return Image;
      case 'mermaid':
        return GitBranch;
      case 'markdown':
        return FileText;
      default:
        return Box;
    }
  };

  const getTypeLabel = (artifact: Artifact) => {
    if (artifact.language) {
      return artifact.language.toUpperCase();
    }
    const typeLabels: Record<string, string> = {
      code: 'Code',
      html: 'HTML',
      svg: 'SVG',
      mermaid: 'Mermaid',
      react: 'React',
      markdown: 'MD',
    };
    return typeLabels[artifact.type] || artifact.type.toUpperCase();
  };

  const handleDownload = (e: React.MouseEvent, artifact: Artifact) => {
    e.stopPropagation();
    const ext = getExtension(artifact.type, artifact.language);
    const blob = new Blob([artifact.content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${artifact.name || 'artifact'}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="w-72 h-full bg-[var(--claude-surface)] border-l border-[var(--claude-border)] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--claude-border)]">
        <span className="font-medium text-[var(--claude-text)]">Artifacts</span>
        <button
          onClick={onDownloadAll}
          className="flex items-center gap-1.5 text-sm text-[var(--claude-text-secondary)] hover:text-[var(--claude-text)] transition-colors"
        >
          <Download className="w-4 h-4" />
          Download all
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-2">
        <div className="space-y-1">
          {artifacts.map((artifact) => {
            const Icon = getIcon(artifact.type);
            return (
              <button
                key={artifact.id}
                onClick={() => onSelect(artifact)}
                className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-[var(--claude-sand-light)] transition-colors text-left group"
              >
                <div className="p-2 rounded-lg bg-[var(--claude-surface-sunken)]">
                  <Icon className="w-4 h-4 text-[var(--claude-text-muted)]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--claude-text)] truncate">
                    {artifact.name}
                  </p>
                  <p className="text-xs text-[var(--claude-text-muted)]">
                    {getTypeLabel(artifact)}
                  </p>
                </div>
                <button
                  onClick={(e) => handleDownload(e, artifact)}
                  className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-[var(--claude-sand)] text-[var(--claude-text-muted)] transition-all"
                >
                  <Download className="w-4 h-4" />
                </button>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Utility function for file extensions
const getExtension = (type: string, language?: string): string => {
  const extensions = {
    language: { typescript: 'ts', javascript: 'js', python: 'py', tsx: 'tsx', jsx: 'jsx' },
    type: { html: 'html', svg: 'svg', mermaid: 'mmd', react: 'tsx', markdown: 'md', code: 'txt' }
  };
  return (language && extensions.language[language]) || extensions.type[type] || language || 'txt';
};
