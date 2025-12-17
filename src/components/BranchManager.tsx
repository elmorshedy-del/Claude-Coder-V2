'use client';

import React, { useState } from 'react';
import { GitBranch, GitMerge, Trash2, Plus, AlertCircle, Check, ExternalLink } from 'lucide-react';

interface BranchManagerProps {
  currentBranch: string;
  branches: string[];
  defaultBranch: string;
  onCreateBranch: (name: string) => Promise<void>;
  onDeleteBranch: (name: string) => Promise<void>;
  onSwitchBranch: (name: string) => void;
  onCreatePR: (branch: string) => Promise<{ url: string; number: number } | null>;
}

export default function BranchManager({
  currentBranch,
  branches,
  defaultBranch,
  onCreateBranch,
  onDeleteBranch,
  onSwitchBranch,
  onCreatePR,
}: BranchManagerProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const withErrorHandling = async (operation: () => Promise<void>, errorMessage: string) => {
    setIsLoading(true);
    setError(null);
    try {
      await operation();
    } catch (err) {
      setError(err instanceof Error ? err.message : errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!newBranchName.trim()) return;
    
    await withErrorHandling(async () => {
      await onCreateBranch(newBranchName.trim());
      setNewBranchName('');
      setIsCreating(false);
    }, 'Failed to create branch');
  };

  const handleDelete = async (branch: string) => {
    if (!confirm(`Delete branch "${branch}"? This cannot be undone.`)) return;
    
    await withErrorHandling(() => onDeleteBranch(branch), 'Failed to delete branch');
  };

  const handleCreatePR = async (branch: string) => {
    await withErrorHandling(async () => {
      const result = await onCreatePR(branch);
      if (result) {
        const newWindow = window.open(result.url, '_blank');
        if (!newWindow) {
          throw new Error('Pop-up blocked. Please allow pop-ups and try again.');
        }
      }
    }, 'Failed to create PR');
  };

  const featureBranches = branches.filter(b => b !== defaultBranch);

  const getBranchItemClasses = (branch: string) => {
    const baseClasses = 'flex items-center gap-3 p-3 rounded-lg transition-colors';
    const activeClasses = 'bg-[var(--claude-terracotta-subtle)] border border-[var(--claude-terracotta)]/20';
    const inactiveClasses = 'hover:bg-[var(--claude-sand-light)] border border-transparent';
    return `${baseClasses} ${currentBranch === branch ? activeClasses : inactiveClasses}`;
  };

  return (
    <div className="p-4 rounded-xl bg-[var(--claude-surface)] border border-[var(--claude-border)]">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <GitBranch className="w-5 h-5 text-[var(--claude-terracotta)]" />
          <h3 className="font-medium text-[var(--claude-text)]">Branches</h3>
        </div>
        <button
          onClick={() => setIsCreating(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-[var(--claude-terracotta)] text-white hover:bg-[var(--claude-terracotta-hover)] transition-colors"
        >
          <Plus className="w-4 h-4" />
          New
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-[var(--claude-error)]/10 border border-[var(--claude-error)]/20 flex items-center gap-2 text-sm text-[var(--claude-error)]">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* New branch form */}
      {isCreating && (
        <div className="mb-4 p-3 rounded-lg bg-[var(--claude-surface-sunken)] border border-[var(--claude-border)]">
          <input
            type="text"
            value={newBranchName}
            onChange={(e) => setNewBranchName(e.target.value)}
            placeholder="feature/my-branch"
            className="w-full px-3 py-2 rounded-lg bg-[var(--claude-surface)] border border-[var(--claude-border)] text-sm text-[var(--claude-text)] placeholder:text-[var(--claude-text-muted)] focus:outline-none focus:border-[var(--claude-terracotta)] mb-2"
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            autoFocus
          />
          <div className="flex items-center gap-2">
            <button
              onClick={handleCreate}
              disabled={!newBranchName.trim() || isLoading}
              className="px-3 py-1.5 rounded-lg text-sm bg-[var(--claude-terracotta)] text-white hover:bg-[var(--claude-terracotta-hover)] disabled:opacity-50 transition-colors"
            >
              Create
            </button>
            <button
              onClick={() => {
                setIsCreating(false);
                setNewBranchName('');
              }}
              className="px-3 py-1.5 rounded-lg text-sm text-[var(--claude-text-secondary)] hover:bg-[var(--claude-sand-light)] transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Branch list */}
      <div className="space-y-2">
        {/* Default branch */}
        <div
          onClick={() => onSwitchBranch(defaultBranch)}
          className={`${getBranchItemClasses(defaultBranch)} cursor-pointer`}
        >
          <GitBranch className="w-4 h-4 text-[var(--claude-text-muted)]" />
          <span className="flex-1 text-sm font-medium text-[var(--claude-text)]">
            {defaultBranch}
          </span>
          <span className="text-xs text-[var(--claude-text-muted)]">default</span>
          {currentBranch === defaultBranch && (
            <Check className="w-4 h-4 text-[var(--claude-success)]" />
          )}
        </div>

        {/* Feature branches */}
        {featureBranches.map((branch) => (
          <div
            key={branch}
            className={getBranchItemClasses(branch)}
          >
            <div
              onClick={() => onSwitchBranch(branch)}
              className="flex items-center gap-3 flex-1 cursor-pointer"
            >
              <GitBranch className="w-4 h-4 text-[var(--claude-text-muted)]" />
              <span className="text-sm font-medium text-[var(--claude-text)] truncate">
                {branch}
              </span>
              {currentBranch === branch && (
                <Check className="w-4 h-4 text-[var(--claude-success)]" />
              )}
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => handleCreatePR(branch)}
                className="p-1.5 rounded-lg hover:bg-[var(--claude-sand)] text-[var(--claude-text-muted)] hover:text-[var(--claude-success)] transition-colors"
                title="Create PR"
              >
                <GitMerge className="w-4 h-4" />
              </button>
              <button
                onClick={() => handleDelete(branch)}
                className="p-1.5 rounded-lg hover:bg-[var(--claude-sand)] text-[var(--claude-text-muted)] hover:text-[var(--claude-error)] transition-colors"
                title="Delete branch"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}

        {featureBranches.length === 0 && (
          <p className="text-sm text-[var(--claude-text-muted)] text-center py-4">
            No feature branches yet
          </p>
        )}
      </div>
    </div>
  );
}
