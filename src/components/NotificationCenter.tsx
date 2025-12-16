'use client';

import React, { useEffect, useState } from 'react';
import { Bell, Clock3, RefreshCw, AlertTriangle, CheckCircle } from 'lucide-react';
import { Notification } from '@/types';
import { formatRelativeTime } from '@/lib/time';

interface NotificationCenterProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function NotificationCenter({ isOpen, onClose }: NotificationCenterProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchNotifications = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/notifications?limit=50');
      const data = await response.json();
      setNotifications(data.notifications || []);
    } catch (err) {
      setError('Failed to load notifications');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchNotifications();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="absolute top-full right-0 mt-2 w-96 rounded-xl bg-[var(--claude-surface)] border border-[var(--claude-border)] shadow-lg z-50 animate-fade-in-up">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--claude-border)]">
        <div className="flex items-center gap-2 text-[var(--claude-text)]">
          <Bell className="w-4 h-4 text-[var(--claude-terracotta)]" />
          <span className="font-medium text-sm">Notification Centre</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchNotifications}
            className="p-1.5 rounded hover:bg-[var(--claude-sand-light)] text-[var(--claude-text-muted)]"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={onClose}
            className="px-2 py-1 rounded text-xs font-medium bg-[var(--claude-sand-light)] text-[var(--claude-text-muted)] hover:text-[var(--claude-text)]"
          >
            Close
          </button>
        </div>
      </div>

      <div className="max-h-96 overflow-y-auto divide-y divide-[var(--claude-border)]">
        {loading && (
          <div className="p-4 text-sm text-[var(--claude-text-muted)]">Loading notifications…</div>
        )}

        {error && !loading && (
          <div className="p-4 flex items-center gap-2 text-[var(--claude-error)] text-sm">
            <AlertTriangle className="w-4 h-4" />
            {error}
          </div>
        )}

        {!loading && !error && notifications.length === 0 && (
          <div className="p-6 text-center text-sm text-[var(--claude-text-muted)]">
            No notifications yet.
          </div>
        )}

        {!loading && !error && notifications.map((notification) => (
          <div key={notification.id} className="p-4 flex items-start gap-3">
            <div className="mt-1">
              <CheckCircle className="w-4 h-4 text-[var(--claude-success)]" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-[var(--claude-text)] truncate">
                  {notification.message || 'Meta notification'}
                </span>
                {notification.channel && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--claude-sand-light)] text-[var(--claude-text-muted)] uppercase tracking-wide">
                    {notification.channel}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-1 text-xs text-[var(--claude-text-muted)]">
                <Clock3 className="w-3 h-3" />
                <span>{formatRelativeTime(notification.createdAt)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
