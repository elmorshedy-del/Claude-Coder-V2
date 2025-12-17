'use client';

import React from 'react';

interface ProgressBarProps {
  current: number;
  total: number;
  label: string;
}

export default function ProgressBar({ current, total, label }: ProgressBarProps) {
  const percentage = total > 0 ? Math.round((current / total) * 100) : 0;

  return (
    <div className="w-full space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-[var(--claude-text-secondary)]">{label}</span>
        <span className="text-[var(--claude-text-muted)]">{current}/{total}</span>
      </div>
      <div className="w-full h-2 bg-[var(--claude-surface-sunken)] rounded-full overflow-hidden">
        <div
          className="h-full bg-[var(--claude-terracotta)] transition-all duration-300"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
