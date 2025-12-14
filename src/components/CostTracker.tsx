'use client';

import React from 'react';
import { DollarSign, TrendingDown } from 'lucide-react';

interface CostTrackerProps {
  cost: number;
  savedPercent?: number;
  sessionTotal?: number;
  compact?: boolean;
}

export default function CostTracker({
  cost,
  savedPercent = 0,
  sessionTotal,
  compact = false,
}: CostTrackerProps) {
  const formatCost = (value: number) => {
    if (value < 0.01) return '<$0.01';
    return `$${value.toFixed(2)}`;
  };

  if (compact) {
    return (
      <div className="inline-flex items-center gap-2 text-xs text-[var(--claude-text-muted)]">
        <span>{formatCost(cost)}</span>
        {savedPercent > 0 && (
          <span className="text-[var(--claude-success)]">
            saved {savedPercent}%
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-4 px-4 py-2 rounded-xl bg-[var(--claude-surface-sunken)] border border-[var(--claude-border)]">
      {/* Current message cost */}
      <div className="flex items-center gap-2">
        <DollarSign className="w-4 h-4 text-[var(--claude-text-muted)]" />
        <div>
          <p className="text-sm font-medium text-[var(--claude-text)]">
            {formatCost(cost)}
          </p>
          <p className="text-xs text-[var(--claude-text-muted)]">this message</p>
        </div>
      </div>

      {/* Cache savings */}
      {savedPercent > 0 && (
        <div className="flex items-center gap-2">
          <TrendingDown className="w-4 h-4 text-[var(--claude-success)]" />
          <div>
            <p className="text-sm font-medium text-[var(--claude-success)]">
              {savedPercent}% saved
            </p>
            <p className="text-xs text-[var(--claude-text-muted)]">from cache</p>
          </div>
        </div>
      )}

      {/* Session total */}
      {sessionTotal !== undefined && (
        <div className="ml-auto text-right">
          <p className="text-sm font-medium text-[var(--claude-text)]">
            {formatCost(sessionTotal)}
          </p>
          <p className="text-xs text-[var(--claude-text-muted)]">session total</p>
        </div>
      )}
    </div>
  );
}
