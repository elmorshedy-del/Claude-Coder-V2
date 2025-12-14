'use client';

import React from 'react';
import { GitBranch, Folder, Sparkles } from 'lucide-react';
import { Repository } from '@/types';

interface WelcomeScreenProps {
  repo?: Repository | null;
  branch?: string;
  onSuggestionClick?: (suggestion: string) => void;
}

export default function WelcomeScreen({ repo, branch, onSuggestionClick }: WelcomeScreenProps) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-8 py-16 animate-fade-in">
      {/* Logo/Title */}
      <div className="mb-8 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 mb-4 rounded-2xl bg-gradient-to-br from-[var(--claude-terracotta)] to-[#E89B7D] shadow-lg">
          <Sparkles className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-4xl font-serif text-[var(--claude-text)] mb-2">
          Claude Coder
        </h1>
        <p className="text-lg text-[var(--claude-text-secondary)]">
          What are you working on?
        </p>
      </div>

      {/* Connected repo info */}
      {repo && (
        <div className="mb-8 flex items-center gap-4 px-5 py-3 rounded-xl bg-[var(--claude-surface)] border border-[var(--claude-border)] shadow-sm">
          <Folder className="w-5 h-5 text-[var(--claude-terracotta)]" />
          <div>
            <p className="font-medium text-[var(--claude-text)]">{repo.fullName}</p>
            <div className="flex items-center gap-2 text-sm text-[var(--claude-text-secondary)]">
              <GitBranch className="w-3.5 h-3.5" />
              <span>{branch || repo.defaultBranch}</span>
            </div>
          </div>
        </div>
      )}

      {/* Quick tips */}
      <div className="max-w-md text-center text-sm text-[var(--claude-text-muted)]">
        <p className="mb-2">💡 Tip: Paste an error message and I&apos;ll find the file</p>
        <p>Just describe what you want to do - I&apos;ll figure out which files to look at</p>
      </div>
    </div>
  );
}
