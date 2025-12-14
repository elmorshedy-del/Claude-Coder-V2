'use client';

import React, { useState } from 'react';
import { Check, Copy, FileCode } from 'lucide-react';

interface CodeBlockProps {
  code: string;
  language?: string;
  filename?: string;
}

export default function CodeBlock({ code, language = 'text', filename }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-4 rounded-xl border border-[var(--claude-border)] overflow-hidden bg-[var(--claude-surface-sunken)]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--claude-border)] bg-[var(--claude-surface)]">
        <div className="flex items-center gap-2">
          <FileCode className="w-4 h-4 text-[var(--claude-text-muted)]" />
          <span className="text-sm text-[var(--claude-text-muted)]">
            {filename || language}
          </span>
        </div>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-sm text-[var(--claude-text-secondary)] hover:bg-[var(--claude-sand-light)] transition-colors"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-[var(--claude-success)]" />
              <span className="text-[var(--claude-success)]">Copied!</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>

      {/* Code */}
      <pre className="p-4 overflow-x-auto">
        <code className="text-sm font-mono text-[var(--claude-text)] leading-relaxed">
          {code}
        </code>
      </pre>
    </div>
  );
}
