'use client';

import React from 'react';
import { Plus, Search, MessageSquare, ChevronLeft, ChevronRight, Check, GitBranch, FileCode } from 'lucide-react';
import { Conversation, Session } from '@/types';

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  conversations: Conversation[];
  currentConversationId: string | null;
  onNewChat: () => void;
  onSelectConversation: (id: string) => void;
  totalCost: number;
}

export default function Sidebar({
  isOpen,
  onToggle,
  conversations,
  currentConversationId,
  onNewChat,
  onSelectConversation,
  totalCost,
}: SidebarProps) {
  const [searchQuery, setSearchQuery] = React.useState('');

  const filteredConversations = conversations.filter(conv =>
    conv.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Convert conversations to session-like display
  const formatDate = (date: Date) => {
    const d = new Date(date);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return d.toLocaleDateString('en-US', { weekday: 'short' });
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  // Collapsed state
  if (!isOpen) {
    return (
      <div className="w-12 h-full bg-[var(--claude-surface-sunken)] border-r border-[var(--claude-border)] flex flex-col items-center py-4">
        <button
          onClick={onToggle}
          className="p-2 rounded-lg hover:bg-[var(--claude-sand-light)] text-[var(--claude-text-secondary)] transition-colors"
          title="Expand sidebar"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
        <button
          onClick={onNewChat}
          className="mt-4 p-2 rounded-lg bg-[var(--claude-terracotta)] text-white hover:bg-[var(--claude-terracotta-hover)] transition-colors"
          title="New chat"
        >
          <Plus className="w-5 h-5" />
        </button>
      </div>
    );
  }

  return (
    <div className="w-64 h-full bg-[var(--claude-surface-sunken)] border-r border-[var(--claude-border)] flex flex-col animate-slide-in-left">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-[var(--claude-border)]">
        <span className="font-medium text-[var(--claude-text)]">Sessions</span>
        <button
          onClick={onToggle}
          className="p-1.5 rounded-lg hover:bg-[var(--claude-sand-light)] text-[var(--claude-text-secondary)] transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
      </div>

      {/* New Chat Button */}
      <div className="p-3">
        <button
          onClick={onNewChat}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--claude-terracotta)] text-white font-medium hover:bg-[var(--claude-terracotta-hover)] transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Chat
        </button>
      </div>

      {/* Search */}
      <div className="px-3 pb-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--claude-text-muted)]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search sessions..."
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-[var(--claude-surface)] border border-[var(--claude-border)] text-sm text-[var(--claude-text)] placeholder:text-[var(--claude-text-muted)] focus:outline-none focus:border-[var(--claude-terracotta)]"
          />
        </div>
      </div>

      {/* Conversations List */}
      <div className="flex-1 overflow-y-auto px-3">
        <div className="space-y-1">
          {filteredConversations.map((conv) => (
            <button
              key={conv.id}
              onClick={() => onSelectConversation(conv.id)}
              className={`
                w-full text-left p-3 rounded-xl transition-colors
                ${currentConversationId === conv.id
                  ? 'bg-[var(--claude-terracotta-subtle)] border border-[var(--claude-terracotta)]/20'
                  : 'hover:bg-[var(--claude-surface)] border border-transparent'
                }
              `}
            >
              <div className="flex items-start gap-2">
                {conv.isComplete ? (
                  <Check className="w-4 h-4 mt-0.5 text-[var(--claude-success)]" />
                ) : (
                  <MessageSquare className="w-4 h-4 mt-0.5 text-[var(--claude-text-muted)]" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--claude-text)] truncate">
                    {conv.title || 'New conversation'}
                  </p>
                  <div className="flex items-center gap-2 mt-1 text-xs text-[var(--claude-text-muted)]">
                    {conv.repoName && (
                      <span className="truncate">{conv.repoName}</span>
                    )}
                    <span>·</span>
                    <span>{formatDate(conv.updatedAt)}</span>
                  </div>
                  {/* File changes summary */}
                  {conv.filesChanged && conv.filesChanged.length > 0 && (
                    <div className="flex items-center gap-2 mt-1.5 text-xs font-mono">
                      <FileCode className="w-3 h-3 text-[var(--claude-text-muted)]" />
                      <span className="text-[var(--claude-success)]">
                        +{conv.filesChanged.reduce((sum, f) => sum + (f.additions || 0), 0)}
                      </span>
                      <span className="text-[var(--claude-error)]">
                        -{conv.filesChanged.reduce((sum, f) => sum + (f.deletions || 0), 0)}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </button>
          ))}

          {filteredConversations.length === 0 && (
            <p className="text-sm text-[var(--claude-text-muted)] text-center py-8">
              {searchQuery ? 'No matching sessions' : 'No sessions yet'}
            </p>
          )}
        </div>
      </div>

      {/* Footer with totals */}
      <div className="p-4 border-t border-[var(--claude-border)]">
        <div className="flex items-center justify-between text-sm">
          <span className="text-[var(--claude-text-muted)]">Total sessions:</span>
          <span className="font-medium text-[var(--claude-text)]">{conversations.length}</span>
        </div>
        <div className="flex items-center justify-between text-sm mt-1">
          <span className="text-[var(--claude-text-muted)]">Total spent:</span>
          <span className="font-medium text-[var(--claude-text)]">${totalCost.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
}
