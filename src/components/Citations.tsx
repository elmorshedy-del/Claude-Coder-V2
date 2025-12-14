'use client';

import React from 'react';
import { ExternalLink } from 'lucide-react';
import { Citation } from '@/types';

interface CitationsProps {
  citations: Citation[];
}

export default function Citations({ citations }: CitationsProps) {
  if (citations.length === 0) return null;

  // Dedupe citations by URL
  const uniqueCitations = citations.filter((cite, index, self) =>
    index === self.findIndex(c => c.url === cite.url)
  );

  return (
    <div className="mt-4 p-3 rounded-xl bg-[var(--claude-surface-sunken)] border border-[var(--claude-border)]">
      <p className="text-xs font-medium text-[var(--claude-text-muted)] uppercase tracking-wide mb-2">
        Sources
      </p>
      <div className="space-y-2">
        {uniqueCitations.map((citation, index) => (
          <a
            key={index}
            href={citation.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-start gap-2 text-sm text-[var(--claude-text-secondary)] hover:text-[var(--claude-terracotta)] transition-colors group"
          >
            <ExternalLink className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 opacity-50 group-hover:opacity-100" />
            <div className="min-w-0 flex-1">
              <p className="font-medium truncate group-hover:underline">
                {citation.title || new URL(citation.url).hostname}
              </p>
              {citation.snippet && (
                <p className="text-xs text-[var(--claude-text-muted)] line-clamp-2 mt-0.5">
                  {citation.snippet}
                </p>
              )}
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
