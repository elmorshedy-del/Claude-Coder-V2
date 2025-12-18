"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { DebuggerCategory, DebuggerEvent, DebuggerSeverity } from '@/types';

interface DebuggerContextValue {
  events: DebuggerEvent[];
  logEvent: (event: Omit<DebuggerEvent, 'id' | 'timestamp'> & { id?: string; timestamp?: string }) => void;
  clearEvents: () => void;
  togglePin: (id: string) => void;
  exportEvents: () => void;
  importEvents: (json: string) => void;
}

const DebuggerContext = createContext<DebuggerContextValue | null>(null);

const STORAGE_KEY = 'claude-debugger-events';
const MAX_STORED_EVENTS = 100;

const safeParse = (json: string) => {
  try {
    return JSON.parse(json);
  } catch (error) {
    console.warn('Failed to parse debugger events', error);
    return [] as DebuggerEvent[];
  }
};

export const DebuggerProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [events, setEvents] = useState<DebuggerEvent[]>(() => {
    if (typeof window === 'undefined') return [];
    const existing = localStorage.getItem(STORAGE_KEY);
    if (!existing) return [];
    const parsed = safeParse(existing) as DebuggerEvent[];
    return parsed.slice(0, MAX_STORED_EVENTS);
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
  }, [events]);

  const logEvent = useCallback(
    (event: Omit<DebuggerEvent, 'id' | 'timestamp'> & { id?: string; timestamp?: string }) => {
      const finalEvent: DebuggerEvent = {
        id: event.id || crypto.randomUUID(),
        timestamp: event.timestamp || new Date().toISOString(),
        category: event.category || 'Note',
        severity: event.severity || 'Info',
        title: event.title || event.summary || 'Event',
        summary: event.summary || event.title || 'Event recorded',
        details: event.details || {},
        duration_ms: event.duration_ms,
        related: event.related || [],
      };

      setEvents((prev) => [finalEvent, ...prev].slice(0, MAX_STORED_EVENTS));
    },
    []
  );

  const clearEvents = useCallback(() => setEvents([]), []);

  const togglePin = useCallback((id: string) => {
    setEvents((prev) => prev.map((ev) => (ev.id === id ? { ...ev, pinned: !ev.pinned } : ev)));
  }, []);

  const exportEvents = useCallback(() => {
    const blob = new Blob([JSON.stringify(events, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `debugger-log-${new Date().toISOString()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }, [events]);

  const importEvents = useCallback((json: string) => {
    const parsed = safeParse(json);
    if (!Array.isArray(parsed)) return;
    const sanitized = parsed
      .map((item) => ({
        id: item.id || crypto.randomUUID(),
        timestamp: item.timestamp || new Date().toISOString(),
        category: (item.category as DebuggerCategory) || 'Note',
        severity: (item.severity as DebuggerSeverity) || 'Info',
        title: item.title || item.summary || 'Imported Event',
        summary: item.summary || item.title || 'Imported Event',
        details: item.details || {},
        duration_ms: item.duration_ms,
        related: item.related || [],
        pinned: Boolean(item.pinned),
      }))
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    setEvents(sanitized.slice(0, MAX_STORED_EVENTS));
  }, []);

  useEffect(() => {
    setEvents((prev) => prev.slice(0, MAX_STORED_EVENTS));
  }, []);

  const value = useMemo(
    () => ({ events, logEvent, clearEvents, togglePin, exportEvents, importEvents }),
    [clearEvents, events, exportEvents, importEvents, logEvent, togglePin]
  );

  return <DebuggerContext.Provider value={value}>{children}</DebuggerContext.Provider>;
};

export const useDebugger = () => {
  const ctx = useContext(DebuggerContext);
  if (!ctx) throw new Error('useDebugger must be used within DebuggerProvider');
  return ctx;
};

export default DebuggerProvider;
