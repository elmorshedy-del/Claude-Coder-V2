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
      <div className="w-12 h-full bg-[#FAFAFA] border-r border-[var(--border-subtle)] flex flex-col items-center py-4">
        <button
          onClick={onToggle}
          className="p-2 rounded-full hover:bg-[var(--accent-dim)] text-[var(--text-secondary)] transition-colors"
          title="Expand sidebar"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
        <button
          onClick={onNewChat}
          className="mt-4 p-2 rounded-full bg-[var(--accent)] text-white hover:opacity-90 transition-colors shadow-sm"
          title="New chat"
        >
          <Plus className="w-5 h-5" />
        </button>
      </div>
    );
  }

  return (
    <div className="w-72 h-full bg-[#FAFAFA] border-r border-[var(--border-subtle)] flex flex-col animate-slide-in-left">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-[var(--border-subtle)]">
        <span className="font-medium text-[var(--text-primary)]">Sessions</span>
        <button
          onClick={onToggle}
          className="p-1.5 rounded-full hover:bg-[var(--accent-dim)] text-[var(--text-secondary)] transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
      </div>

      {/* New Chat Button */}
      <div className="p-3">
        <button
          onClick={onNewChat}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl bg-[var(--accent)] text-white font-medium hover:opacity-90 transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />
          New Chat
        </button>
      </div>

      {/* Search */}
      <div className="px-3 pb-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-tertiary)]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search sessions..."
            className="w-full pl-9 pr-3 py-2 rounded-xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent)] shadow-sm"
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
                w-full text-left p-3 my-1 mx-1 rounded-xl transition-all duration-200
                ${currentConversationId === conv.id
                  ? 'bg-white shadow-sm border border-[var(--border-subtle)] text-[var(--text-primary)] font-medium'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--border-subtle)]'
                }
              `}
            >
              <div className="flex items-start gap-2">
                {conv.isComplete ? (
                  <Check className="w-4 h-4 mt-0.5 text-[var(--success)]" />
                ) : (
                  <MessageSquare className="w-4 h-4 mt-0.5 text-[var(--text-tertiary)]" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--text-primary)] truncate">
                    {conv.title || 'New conversation'}
                  </p>
                  <div className="flex items-center gap-2 mt-1 text-xs text-[var(--text-tertiary)]">
                    {conv.repoName && (
                      <span className="truncate">{conv.repoName}</span>
                    )}
                    <span>·</span>
                    <span>{formatDate(conv.updatedAt)}</span>
                  </div>
                  {/* File changes summary */}
                  {conv.filesChanged && conv.filesChanged.length > 0 && (() => {
                    const additions = conv.filesChanged.reduce((sum, f) => sum + (f.additions || 0), 0);
                    const deletions = conv.filesChanged.reduce((sum, f) => sum + (f.deletions || 0), 0);
                    return (
                      <div className="flex items-center gap-2 mt-1.5 text-xs font-mono">
                        <FileCode className="w-3 h-3 text-[var(--text-tertiary)]" />
                        <span className="text-[var(--success)]">+{additions}</span>
                        <span className="text-[var(--error)]">-{deletions}</span>
                      </div>
                    );
                  })()}
                </div>
              </div>
            </button>
          ))}

          {filteredConversations.length === 0 && (
            <p className="text-sm text-[var(--text-tertiary)] text-center py-8">
              {searchQuery ? 'No matching sessions' : 'No sessions yet'}
            </p>
          )}
        </div>
      </div>

      {/* Footer with totals */}
      <div className="p-4 border-t border-[var(--border-subtle)]">
        <div className="flex items-center justify-between text-sm">
          <span className="text-[var(--text-tertiary)]">Total sessions:</span>
          <span className="font-medium text-[var(--text-primary)]">{conversations.length}</span>
        </div>
        <div className="flex items-center justify-between text-sm mt-1">
          <span className="text-[var(--text-tertiary)]">Total spent:</span>
          <span className="font-medium text-[var(--text-primary)]">${totalCost.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
}
