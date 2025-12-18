'use client';

import React from 'react';
import ReactMarkdown from 'react-markdown';
import { Sparkles } from 'lucide-react';
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
    <div className="w-full">
      <div className={`group w-full flex ${isUser ? 'justify-end' : 'justify-start'}`}>
        <div className={`max-w-3xl w-full ${isUser ? '' : ''}`}>
          {!isUser && (
            <div className="flex items-center gap-3 mb-3">
              <div className="w-7 h-7 rounded-md bg-[var(--accent)] flex items-center justify-center shadow-sm">
                <Sparkles className="w-3.5 h-3.5 text-white" />
              </div>
              <span className="font-semibold text-sm text-[var(--text-primary)]">Claude</span>
            </div>
          )}

          <div
            className={`relative px-6 py-5 ${
              isUser
                ? 'bg-[#F4F4F5] text-[var(--text-primary)] rounded-3xl rounded-tr-sm shadow-sm ml-auto max-w-3xl'
                : 'bg-transparent pl-0'
            }`}
          >
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
            <div className="prose max-w-none prose-p:leading-relaxed prose-pre:rounded-xl">
              <ReactMarkdown
                skipHtml
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
              <div className="flex items-center gap-2 text-[var(--text-tertiary)]">
                <div className="w-2 h-2 rounded-full bg-[var(--accent)] animate-pulse" />
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
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--accent-dim)] text-xs text-[var(--text-secondary)]"
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
