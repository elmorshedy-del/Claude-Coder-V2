'use client';

import React from 'react';
import { ExternalLink, Trash2, Check, X, GitBranch, FileCode, Plus, Minus, Eye } from 'lucide-react';
import { PostEditState, FileChange } from '@/types';

interface PostEditActionsProps {
  state: PostEditState;
  onViewPR?: () => void;
  onDiscard?: () => void;
  onConfirm?: () => void;
  onCancel?: () => void;
}

export default function PostEditActions({
  state,
  onViewPR,
  onDiscard,
  onConfirm,
  onCancel,
}: PostEditActionsProps) {
  const { mode, branch, filesChanged, totalAdditions, totalDeletions, prUrl, previewUrl, status } = state;

  return (
    <div className="rounded-2xl border border-[var(--claude-border)] bg-[var(--claude-surface)] p-5 shadow-sm animate-fade-in-up">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        {mode === 'safe' ? (
          <>
            <div className="p-2 rounded-lg bg-[var(--claude-success)]/10">
              <GitBranch className="w-5 h-5 text-[var(--claude-success)]" />
            </div>
            <div>
              <p className="font-medium text-[var(--claude-text)]">
                {status === 'pushed' ? 'Changes pushed to branch' : 'Ready to push'}
              </p>
              {branch && (
                <p className="text-sm text-[var(--claude-text-secondary)]">
                  Branch: <code className="px-1.5 py-0.5 rounded bg-[var(--claude-sand-light)] text-[var(--claude-terracotta)]">{branch}</code>
                </p>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="p-2 rounded-lg bg-[var(--claude-warning)]/10">
              <FileCode className="w-5 h-5 text-[var(--claude-warning)]" />
            </div>
            <div>
              <p className="font-medium text-[var(--claude-text)]">
                Direct Mode: Push to main
              </p>
              <p className="text-sm text-[var(--claude-text-secondary)]">
                Changes will be applied immediately
              </p>
            </div>
          </>
        )}
      </div>

      {/* Files changed */}
      {filesChanged.length > 0 && (
        <div className="mb-4 p-3 rounded-xl bg-[var(--claude-surface-sunken)] border border-[var(--claude-border)]">
          <p className="text-xs font-medium text-[var(--claude-text-muted)] uppercase tracking-wide mb-2">
            Files changed
          </p>
          <div className="space-y-1.5">
            {filesChanged.map((file, index) => (
              <FileChangeItem key={index} file={file} />
            ))}
          </div>
          <div className="mt-3 pt-3 border-t border-[var(--claude-border)] flex items-center gap-4 text-sm">
            <span className="flex items-center gap-1 text-[var(--claude-success)]">
              <Plus className="w-3.5 h-3.5" />
              {totalAdditions}
            </span>
            <span className="flex items-center gap-1 text-[var(--claude-error)]">
              <Minus className="w-3.5 h-3.5" />
              {totalDeletions}
            </span>
          </div>
        </div>
      )}

      {/* Preview URL */}
      {previewUrl && (
        <div className="mb-4 p-3 rounded-xl bg-[var(--claude-terracotta-subtle)] border border-[var(--claude-terracotta)]/20">
          <p className="text-xs font-medium text-[var(--claude-terracotta)] mb-1">Preview available</p>
          <a
            href={previewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-[var(--claude-terracotta)] hover:underline break-all"
          >
            {previewUrl}
          </a>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3">
        {mode === 'safe' ? (
          <>
            <button
              onClick={() => prUrl ? window.open(prUrl, '_blank') : onViewPR?.()}
              disabled={!prUrl && !onViewPR}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--claude-terracotta)] text-white font-medium hover:bg-[var(--claude-terracotta-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              View PR
            </button>
            {/* View Preview button - only shows when previewUrl is available */}
            {previewUrl && (
              <button
                onClick={() => window.open(previewUrl, '_blank')}
                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--claude-success)] text-white font-medium hover:bg-[var(--claude-success)]/80 transition-colors"
              >
                <Eye className="w-4 h-4" />
                Preview
              </button>
            )}
            <button
              onClick={onDiscard}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-[var(--claude-border)] text-[var(--claude-text-secondary)] hover:bg-[var(--claude-surface-sunken)] transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Discard
            </button>
          </>
        ) : (
          <>
            <button
              onClick={onConfirm}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--claude-terracotta)] text-white font-medium hover:bg-[var(--claude-terracotta-hover)] transition-colors"
            >
              <Check className="w-4 h-4" />
              Confirm Push
            </button>
            <button
              onClick={onCancel}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-[var(--claude-border)] text-[var(--claude-text-secondary)] hover:bg-[var(--claude-surface-sunken)] transition-colors"
            >
              <X className="w-4 h-4" />
              Cancel
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function FileChangeItem({ file }: { file: FileChange }) {
  return (
    <div className="flex items-center gap-2 text-sm font-mono">
      <span className={`
        px-1.5 py-0.5 rounded text-xs font-medium
        ${file.action === 'create' ? 'bg-[var(--claude-success)]/10 text-[var(--claude-success)]' : ''}
        ${file.action === 'edit' ? 'bg-[var(--claude-warning)]/10 text-[var(--claude-warning)]' : ''}
        ${file.action === 'delete' ? 'bg-[var(--claude-error)]/10 text-[var(--claude-error)]' : ''}
      `}>
        {file.action === 'create' ? 'A' : file.action === 'edit' ? 'M' : 'D'}
      </span>
      <span className="text-[var(--claude-text-secondary)] truncate">{file.path}</span>
      {(file.additions || file.deletions) && (
        <span className="ml-auto flex items-center gap-2 text-xs">
          {file.additions && (
            <span className="text-[var(--claude-success)]">+{file.additions}</span>
          )}
          {file.deletions && (
            <span className="text-[var(--claude-error)]">-{file.deletions}</span>
          )}
        </span>
      )}
    </div>
  );
}
