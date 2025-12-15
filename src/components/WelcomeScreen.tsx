'use client';

import React from 'react';
import { GitBranch, Folder, Sparkles, MessageCircle, Code } from 'lucide-react';
import { Repository } from '@/types';

interface WelcomeScreenProps {
  repo?: Repository | null;
  branch?: string;
  onSuggestionClick?: (suggestion: string) => void;
}

export default function WelcomeScreen({ repo, branch, onSuggestionClick }: WelcomeScreenProps) {
  // Chat-only mode (no repo selected)
  if (!repo) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-8 py-16 animate-fade-in">
        <div className="mb-8 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 mb-4 rounded-2xl bg-gradient-to-br from-[var(--claude-terracotta)] to-[#E89B7D] shadow-lg">
            <Sparkles className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-4xl font-serif text-[var(--claude-text)] mb-2">
            What would you like to do?
          </h1>
        </div>

        <div className="flex flex-col gap-4 max-w-md w-full">
          {/* Chat option */}
          <div className="flex items-start gap-4 px-5 py-4 rounded-xl bg-[var(--claude-surface)] border border-[var(--claude-border)] shadow-sm">
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-[var(--claude-terracotta-subtle)]">
              <MessageCircle className="w-5 h-5 text-[var(--claude-terracotta)]" />
            </div>
            <div>
              <p className="font-medium text-[var(--claude-text)]">Just chat with Claude</p>
              <p className="text-sm text-[var(--claude-text-muted)]">
                Ask questions, get help with code, brainstorm ideas
              </p>
            </div>
          </div>

          {/* Code editing option */}
          <div className="flex items-start gap-4 px-5 py-4 rounded-xl bg-[var(--claude-surface)] border border-[var(--claude-border)] shadow-sm">
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-[var(--claude-terracotta-subtle)]">
              <Code className="w-5 h-5 text-[var(--claude-terracotta)]" />
            </div>
            <div>
              <p className="font-medium text-[var(--claude-text)]">Connect a repo to edit code</p>
              <p className="text-sm text-[var(--claude-text-muted)]">
                Select a repository from the dropdown above to enable code editing
              </p>
            </div>
          </div>
        </div>

        <p className="mt-8 text-sm text-[var(--claude-text-muted)]">
          Type a message below to start chatting
        </p>
      </div>
    );
  }

  // Repo connected mode
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

      {/* Quick tips */}
      <div className="max-w-md text-center text-sm text-[var(--claude-text-muted)]">
        <p className="mb-2">💡 Tip: Paste an error message and I&apos;ll find the file</p>
        <p>Just describe what you want to do - I&apos;ll figure out which files to look at</p>
      </div>
    </div>
  );
}
