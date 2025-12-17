'use client';

import React from 'react';

interface CodeDiffProps {
  oldCode: string;
  newCode: string;
  language?: string;
}

export default function CodeDiff({ oldCode, newCode, language = 'typescript' }: CodeDiffProps) {
  return (
    <div className="rounded-xl overflow-hidden border border-[var(--claude-border)]">
      <div className="grid grid-cols-2 divide-x divide-[var(--claude-border)]">
        {/* Before */}
        <div className="bg-red-50 dark:bg-red-950/20">
          <div className="px-4 py-2 bg-red-100 dark:bg-red-900/30 border-b border-red-200 dark:border-red-800">
            <span className="text-sm font-medium text-red-700 dark:text-red-300">Before</span>
          </div>
          <pre className="p-4 text-sm overflow-x-auto">
            <code className="text-red-800 dark:text-red-200">{oldCode}</code>
          </pre>
        </div>

        {/* After */}
        <div className="bg-green-50 dark:bg-green-950/20">
          <div className="px-4 py-2 bg-green-100 dark:bg-green-900/30 border-b border-green-200 dark:border-green-800">
            <span className="text-sm font-medium text-green-700 dark:text-green-300">After</span>
          </div>
          <pre className="p-4 text-sm overflow-x-auto">
            <code className="text-green-800 dark:text-green-200">{newCode}</code>
          </pre>
        </div>
      </div>
    </div>
  );
}
