'use client';

import React, { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Globe,
  FileText,
  Search,
  Edit,
  FilePlus,
  Loader2,
  Check,
  AlertCircle
} from 'lucide-react';

export interface ToolAction {
  id: string;
  type: 'web_search' | 'web_fetch' | 'read_file' | 'str_replace' | 'create_file' | 'grep_search' | 'search_files';
  status: 'running' | 'complete' | 'error';
  summary: string;
  details?: string;
  result?: string;
}

interface ActionBlockProps {
  actions: ToolAction[];
}

export default function ActionBlock({ actions }: ActionBlockProps) {
  const [expanded, setExpanded] = useState(false);

  if (!actions || actions.length === 0) return null;

  const allComplete = actions.every(a => a.status === 'complete');
  const hasError = actions.some(a => a.status === 'error');
  const runningCount = actions.filter(a => a.status === 'running').length;

  // Single action - show inline
  if (actions.length === 1) {
    return <SingleAction action={actions[0]} />;
  }

  // Multiple actions - show as "N steps"
  return (
    <div className="my-3 rounded-xl border border-[var(--claude-border)] bg-[var(--claude-surface-sunken)] overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[var(--claude-sand-light)] transition-colors"
      >
        {!allComplete ? (
          <Loader2 className="w-4 h-4 text-[var(--claude-terracotta)] animate-spin" />
        ) : hasError ? (
          <AlertCircle className="w-4 h-4 text-[var(--claude-error)]" />
        ) : (
          <Check className="w-4 h-4 text-[var(--claude-success)]" />
        )}
        <span className="text-sm font-medium text-[var(--claude-text-secondary)]">
          {runningCount > 0 ? `Running ${runningCount} of ${actions.length} steps...` : `${actions.length} steps`}
        </span>
        <div className="ml-auto">
          {expanded ? (
            <ChevronDown className="w-4 h-4 text-[var(--claude-text-muted)]" />
          ) : (
            <ChevronRight className="w-4 h-4 text-[var(--claude-text-muted)]" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-3 space-y-2 border-t border-[var(--claude-border)] pt-3">
          {actions.map((action) => (
            <SingleAction key={action.id} action={action} compact />
          ))}
        </div>
      )}
    </div>
  );
}

function SingleAction({ action, compact = false }: { action: ToolAction; compact?: boolean }) {
  const [expanded, setExpanded] = useState(false);

  const icons: Record<string, React.ReactNode> = {
    web_search: <Globe className="w-4 h-4" />,
    web_fetch: <Globe className="w-4 h-4" />,
    read_file: <FileText className="w-4 h-4" />,
    str_replace: <Edit className="w-4 h-4" />,
    create_file: <FilePlus className="w-4 h-4" />,
    grep_search: <Search className="w-4 h-4" />,
    search_files: <Search className="w-4 h-4" />,
  };

  const statusColors = {
    running: 'text-[var(--claude-terracotta)]',
    complete: 'text-[var(--claude-success)]',
    error: 'text-[var(--claude-error)]',
  };

  if (compact) {
    return (
      <div className="flex items-center gap-2 py-2 text-sm">
        <span className={statusColors[action.status]}>
          {action.status === 'running' ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : action.status === 'error' ? (
            <AlertCircle className="w-3.5 h-3.5" />
          ) : (
            <Check className="w-3.5 h-3.5" />
          )}
        </span>
        <span className="text-[var(--claude-text-muted)]">{icons[action.type]}</span>
        <span className="text-[var(--claude-text-secondary)]">{action.summary}</span>
      </div>
    );
  }

  return (
    <div className="my-3 rounded-xl border border-[var(--claude-border)] bg-[var(--claude-surface-sunken)] overflow-hidden">
      <button
        onClick={() => action.result && setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[var(--claude-sand-light)] transition-colors"
      >
        <span className={statusColors[action.status]}>
          {action.status === 'running' ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : action.status === 'error' ? (
            <AlertCircle className="w-4 h-4" />
          ) : (
            icons[action.type]
          )}
        </span>
        <span className="text-sm font-medium text-[var(--claude-text-secondary)]">
          {action.summary}
        </span>
        {action.result && (
          <div className="ml-auto">
            {expanded ? (
              <ChevronDown className="w-4 h-4 text-[var(--claude-text-muted)]" />
            ) : (
              <ChevronRight className="w-4 h-4 text-[var(--claude-text-muted)]" />
            )}
          </div>
        )}
      </button>

      {expanded && action.result && (
        <div className="px-4 pb-4 pt-2 border-t border-[var(--claude-border)]">
          <pre className="text-xs font-mono text-[var(--claude-text-secondary)] whitespace-pre-wrap bg-[var(--claude-surface)] p-3 rounded-lg overflow-x-auto max-h-48 overflow-y-auto">
            {action.result}
          </pre>
        </div>
      )}
    </div>
  );
}
