'use client';

import React from 'react';
import ReactMarkdown from 'react-markdown';
import { User, Sparkles } from 'lucide-react';
import { Message } from '@/types';
import ThinkingBlock from './ThinkingBlock';
import ActionBlock from './ActionBlock';
import CodeBlock from './CodeBlock';
import CostTracker from './CostTracker';
import PostEditActions from './PostEditActions';
import Citations from './Citations';

interface ChatMessageProps {
  message: Message;
  onViewPR?: (prUrl?: string) => void;
  onDiscard?: () => void;
}

export default function ChatMessage({ message, onViewPR, onDiscard }: ChatMessageProps) {
  const isUser = message.role === 'user';

  return (
    <div className={`py-6 px-4 ${isUser ? 'bg-transparent' : 'bg-[var(--claude-surface-sunken)]/50'}`}>
      <div className="max-w-3xl mx-auto">
        <div className="flex gap-4">
          {/* Avatar */}
          <div className={`
            flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center
            ${isUser
              ? 'bg-[var(--claude-sand-light)]'
              : 'bg-gradient-to-br from-[var(--claude-terracotta)] to-[#E89B7D]'
            }
          `}>
            {isUser ? (
              <User className="w-4 h-4 text-[var(--claude-text-secondary)]" />
            ) : (
              <Sparkles className="w-4 h-4 text-white" />
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {/* Role label */}
            <p className="text-sm font-medium text-[var(--claude-text-secondary)] mb-2">
              {isUser ? 'You' : 'Claude'}
            </p>

            {/* Thinking block */}
            {message.thinkingContent && (
              <ThinkingBlock
                content={message.thinkingContent}
                isStreaming={message.isStreaming}
              />
            )}

            {/* Tool actions */}
            {message.toolActions && message.toolActions.length > 0 && (
              <ActionBlock actions={message.toolActions} />
            )}

            {/* Message content */}
            <div className="prose max-w-none">
              <ReactMarkdown
                components={{
                  code({ className, children, ...props }) {
                    const match = /language-(\w+)/.exec(className || '');
                    const isInline = !match;
                    
                    if (isInline) {
                      return (
                        <code className={className} {...props}>
                          {children}
                        </code>
                      );
                    }

                    return (
                      <CodeBlock
                        code={String(children).replace(/\n$/, '')}
                        language={match?.[1] || 'text'}
                      />
                    );
                  },
                }}
              >
                {message.content}
              </ReactMarkdown>
            </div>

            {/* Loading indicator */}
            {message.isStreaming && !message.content && (
              <div className="flex items-center gap-2 text-[var(--claude-text-muted)]">
                <div className="w-2 h-2 rounded-full bg-[var(--claude-terracotta)] animate-pulse" />
                <span className="text-sm">Thinking...</span>
              </div>
            )}

            {/* File changes */}
            {message.filesChanged && message.filesChanged.length > 0 && (() => {
              const totalAdditions = message.filesChanged.reduce((sum, f) => sum + (f.additions || 0), 0);
              const totalDeletions = message.filesChanged.reduce((sum, f) => sum + (f.deletions || 0), 0);
              return (
                <PostEditActions
                  state={{
                    mode: 'safe',
                    filesChanged: message.filesChanged,
                    totalAdditions,
                    totalDeletions,
                    prUrl: message.prUrl,
                    previewUrl: message.previewUrl,
                    status: message.prUrl ? 'pr_created' : 'pushed',
                  }}
                  onViewPR={(prUrl) => {
                    if (onViewPR) {
                      onViewPR(prUrl ?? message.prUrl);
                    } else if (message.prUrl) {
                      window.open(message.prUrl, '_blank');
                    }
                  }}
                  onDiscard={onDiscard}
                />
              );
            })()}

            {/* Citations from web search */}
            {message.citations && message.citations.length > 0 && (
              <Citations citations={message.citations} />
            )}

            {/* Cost tracker */}
            {!isUser && message.cost !== undefined && (
              <div className="mt-4">
                <CostTracker
                  cost={message.cost}
                  savedPercent={message.savedPercent}
                  compact
                />
              </div>
            )}

            {/* Uploaded files indicator */}
            {message.files && message.files.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {message.files.map((file, index) => (
                  <span
                    key={index}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--claude-sand-light)] text-xs text-[var(--claude-text-secondary)]"
                  >
                    📎 {file.name}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
