'use client';

import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Brain } from 'lucide-react';

interface ThinkingBlockProps {
  content: string;
  isStreaming?: boolean;
}

export default function ThinkingBlock({ content, isStreaming = false }: ThinkingBlockProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!content) return null;

  return (
    <div className="my-3 rounded-xl border border-[var(--claude-border)] bg-[var(--claude-surface-sunken)] overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[var(--claude-sand-light)] transition-colors"
      >
        <Brain className="w-4 h-4 text-[var(--claude-terracotta)]" />
        <span className="text-sm font-medium text-[var(--claude-text-secondary)]">
          {isStreaming ? 'Thinking...' : 'View thinking'}
        </span>
        <div className="ml-auto">
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-[var(--claude-text-muted)]" />
          ) : (
            <ChevronRight className="w-4 h-4 text-[var(--claude-text-muted)]" />
          )}
        </div>
        {isStreaming && (
          <div className="w-2 h-2 rounded-full bg-[var(--claude-terracotta)] animate-pulse" />
        )}
      </button>
      
      {isExpanded && (
        <div className="px-4 pb-4 pt-2 border-t border-[var(--claude-border)]">
          <pre className="text-sm font-mono text-[var(--claude-text-secondary)] whitespace-pre-wrap leading-relaxed">
            {content}
          </pre>
        </div>
      )}
    </div>
  );
}
