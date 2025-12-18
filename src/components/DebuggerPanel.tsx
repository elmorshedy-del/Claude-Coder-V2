"use client";

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, Copy, Download, Filter, Pin, PinOff, Search, Trash2, Upload } from 'lucide-react';
import { DebuggerCategory, DebuggerEvent, DebuggerSeverity } from '@/types';
import { useDebugger } from './DebuggerProvider';

const badgeColors: Record<DebuggerCategory, string> = {
  Tool: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  Command: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  File: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  Network: 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200',
  Plan: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200',
  Test: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
  Error: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  Note: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
};

const severityColors: Record<DebuggerSeverity, string> = {
  Info: 'text-[var(--claude-text-secondary)]',
  Warning: 'text-amber-600',
  Error: 'text-red-600',
};

const truncateText = (text: string, max = 400) => {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
};

const DiffPreview: React.FC<{ diff?: string }> = ({ diff }) => {
  const [expanded, setExpanded] = useState(false);
  if (!diff) return null;
  const lines = diff.split('\n');
  const preview = expanded ? lines : lines.slice(0, 30);
  return (
    <div className="mt-2 bg-[var(--claude-surface-sunken)] border border-[var(--claude-border)] rounded-lg p-2 text-xs font-mono text-[var(--claude-text)]">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[var(--claude-text-secondary)]">Diff preview</span>
        {lines.length > 30 && (
          <button
            onClick={() => setExpanded((prev) => !prev)}
            className="text-[var(--claude-terracotta)] text-xs hover:underline"
          >
            {expanded ? 'Hide full diff' : 'View full diff'}
          </button>
        )}
      </div>
      <pre className="whitespace-pre-wrap">{preview.join('\n')}</pre>
    </div>
  );
};

const EventCard: React.FC<{ event: DebuggerEvent }> = ({ event }) => {
  const [open, setOpen] = useState(false);
  const [showFullOutput, setShowFullOutput] = useState(false);
  const { togglePin } = useDebugger();

  const jsonDetails = useMemo(() => JSON.stringify(event.details || {}, null, 2), [event.details]);
  const truncatedDetails = showFullOutput ? jsonDetails : truncateText(jsonDetails, 800);

  return (
    <div className="rounded-xl border border-[var(--claude-border)] bg-[var(--claude-surface)] p-3 shadow-sm space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${badgeColors[event.category] || badgeColors.Note}`}>
              {event.category}
            </span>
            <span className={`text-xs ${severityColors[event.severity] || severityColors.Info}`}>{event.severity}</span>
            <span className="text-xs text-[var(--claude-text-muted)]">{new Date(event.timestamp).toLocaleTimeString()}</span>
          </div>
          <div className="text-sm font-semibold text-[var(--claude-text)]">{event.title || 'Untitled event'}</div>
          <div className="text-sm text-[var(--claude-text-secondary)]">{event.summary || 'No summary provided.'}</div>
          {event.duration_ms ? (
            <div className="text-xs text-[var(--claude-text-muted)]">Duration: {event.duration_ms.toFixed(0)} ms</div>
          ) : null}
          {event.related && event.related.length > 0 && (
            <div className="text-xs text-[var(--claude-text-muted)]">Related: {event.related.join(', ')}</div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            className="text-[var(--claude-text-muted)] hover:text-[var(--claude-terracotta)]"
            onClick={() => togglePin(event.id)}
            title={event.pinned ? 'Unpin' : 'Pin event'}
          >
            {event.pinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
          </button>
          <button
            className="text-[var(--claude-text-muted)] hover:text-[var(--claude-terracotta)]"
            onClick={() => navigator.clipboard.writeText(jsonDetails)}
            title="Copy event JSON"
          >
            <Copy className="w-4 h-4" />
          </button>
          <button
            className="text-[var(--claude-text-muted)] hover:text-[var(--claude-terracotta)]"
            onClick={() => setOpen((prev) => !prev)}
            title="Toggle details"
          >
            {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {event.category === 'File' && (
        <DiffPreview diff={(event.details as { diff?: string })?.diff} />
      )}

      {open && (
        <div className="mt-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-[var(--claude-text-muted)]">Details</span>
            {jsonDetails.length > 800 && (
              <button
                className="text-[var(--claude-terracotta)] text-xs hover:underline"
                onClick={() => setShowFullOutput((prev) => !prev)}
              >
                {showFullOutput ? 'Show less' : 'Expand to view'}
              </button>
            )}
          </div>
          <pre className="text-xs bg-[var(--claude-surface-sunken)] border border-[var(--claude-border)] rounded-lg p-2 overflow-x-auto whitespace-pre-wrap text-[var(--claude-text)]">
            {truncatedDetails}
          </pre>
        </div>
      )}
    </div>
  );
};

const categories: DebuggerCategory[] = ['Tool', 'Command', 'File', 'Network', 'Plan', 'Test', 'Error', 'Note'];

const PANEL_WIDTH = 400;
const HANDLE_WIDTH = 44;

const DebuggerPanel: React.FC = () => {
  const { events, clearEvents, exportEvents, importEvents } = useDebugger();
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('debuggerCollapsed') === 'true';
  });
  const [activeCategory, setActiveCategory] = useState<DebuggerCategory | 'All'>('All');
  const [severity, setSeverity] = useState<DebuggerSeverity | 'All'>('All');
  const [onlyErrors, setOnlyErrors] = useState(false);
  const [query, setQuery] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const sorted = useMemo(
    () => {
      const pinned = events.filter((ev) => ev.pinned);
      const unpinned = events.filter((ev) => !ev.pinned);
      return [...pinned, ...unpinned];
    },
    [events]
  );

  const filtered = useMemo(() => {
    return sorted.filter((event) => {
      if (onlyErrors && event.severity !== 'Error' && event.category !== 'Error') return false;
      if (activeCategory !== 'All' && event.category !== activeCategory) return false;
      if (severity !== 'All' && event.severity !== severity) return false;
      if (!query) return true;
      const haystack = `${event.summary} ${JSON.stringify(event.details)}`.toLowerCase();
      return haystack.includes(query.toLowerCase());
    });
  }, [activeCategory, onlyErrors, query, severity, sorted]);

  const handleImport = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    const reader = new FileReader();
    reader.onload = (e) => {
      if (typeof e.target?.result === 'string') {
        importEvents(e.target.result);
      }
    };
    reader.readAsText(file);
  };

  useEffect(() => {
    const root = document.getElementById('app-root');
    if (!root) return;

    const offset = collapsed ? HANDLE_WIDTH : PANEL_WIDTH + HANDLE_WIDTH;
    root.style.setProperty('--debugger-offset', `${offset}px`);

    return () => {
      root.style.removeProperty('--debugger-offset');
    };
  }, [collapsed]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem('debuggerCollapsed', String(collapsed));
  }, [collapsed]);

  return (
    <>
      <div
        className={`fixed top-0 right-0 h-screen z-50 transition-transform duration-200 ${collapsed ? 'translate-x-[calc(100%-2.75rem)]' : ''}`}
        style={{ width: PANEL_WIDTH + HANDLE_WIDTH }}
      >
        <div className="relative h-full flex">
          <div
            className={`h-full bg-[var(--claude-bg)] border-l border-[var(--claude-border)] shadow-lg flex flex-col transition-opacity duration-200${collapsed ? ' pointer-events-none opacity-0' : ' opacity-100'}`}
            style={{ width: PANEL_WIDTH }}
            aria-hidden={collapsed}
          >
            <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--claude-border)] bg-[var(--claude-surface)]">
              <div className="flex items-center gap-2 text-[var(--claude-text)]">
                <Filter className="w-4 h-4" />
                <span className="font-semibold text-sm">Debugger Panel</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="p-1 rounded hover:bg-[var(--claude-sand-light)]"
                  title="Import log"
                >
                  <Upload className="w-4 h-4 text-[var(--claude-text-muted)]" />
                </button>
                <button
                  onClick={exportEvents}
                  className="p-1 rounded hover:bg-[var(--claude-sand-light)]"
                  title="Export session"
                >
                  <Download className="w-4 h-4 text-[var(--claude-text-muted)]" />
                </button>
                <button
                  onClick={clearEvents}
                  className="p-1 rounded hover:bg-[var(--claude-sand-light)]"
                  title="Clear panel"
                >
                  <Trash2 className="w-4 h-4 text-[var(--claude-text-muted)]" />
                </button>
              </div>
            </div>

            <div className="p-3 space-y-3 overflow-y-auto">
              <div className="flex items-center gap-2">
                <div className="flex-1 relative">
                  <Search className="w-4 h-4 text-[var(--claude-text-muted)] absolute left-2 top-2.5" />
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search events"
                    className="w-full pl-8 pr-3 py-2 rounded-lg bg-[var(--claude-surface-sunken)] border border-[var(--claude-border)] text-sm text-[var(--claude-text)]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-sm">
                <select
                  value={activeCategory}
                  onChange={(e) => setActiveCategory(e.target.value as DebuggerCategory | 'All')}
                  className="w-full px-2 py-2 rounded-lg bg-[var(--claude-surface-sunken)] border border-[var(--claude-border)] text-[var(--claude-text)]"
                >
                  <option value="All">All Categories</option>
                  {categories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
                <select
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value as DebuggerSeverity | 'All')}
                  className="w-full px-2 py-2 rounded-lg bg-[var(--claude-surface-sunken)] border border-[var(--claude-border)] text-[var(--claude-text)]"
                >
                  <option value="All">All Severity</option>
                  <option value="Info">Info</option>
                  <option value="Warning">Warning</option>
                  <option value="Error">Error</option>
                </select>
              </div>

              <label className="flex items-center gap-2 text-sm text-[var(--claude-text)]">
                <input type="checkbox" checked={onlyErrors} onChange={(e) => setOnlyErrors(e.target.checked)} />
                Only show errors
              </label>

              {filtered.length === 0 ? (
                <div className="text-sm text-[var(--claude-text-muted)] bg-[var(--claude-surface-sunken)] border border-[var(--claude-border)] rounded-lg p-4">
                  No debugger events yet. Actions you take will appear here.
                </div>
              ) : (
                <div className="space-y-3">
                  {filtered.map((event) => (
                    <EventCard key={event.id} event={event} />
                  ))}
                </div>
              )}
            </div>
          </div>

          <button
            onClick={() => setCollapsed((prev) => !prev)}
            className="w-11 h-12 mt-6 rounded-l-xl bg-[var(--claude-terracotta)] text-white flex items-center justify-center shadow-lg pointer-events-auto"
            title={collapsed ? 'Expand debugger' : 'Collapse debugger'}
            aria-expanded={!collapsed}
          >
            {collapsed ? <ChevronLeft className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
          </button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={(e) => handleImport(e.target.files)}
        />
      </div>

      {collapsed && (
        <button
          type="button"
          className="fixed right-4 bottom-4 z-[60] flex items-center gap-2 px-3 py-2 rounded-full bg-[var(--claude-terracotta)] text-white shadow-lg hover:bg-[var(--claude-terracotta-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--claude-terracotta)] focus-visible:ring-offset-2"
          onClick={() => setCollapsed(false)}
          aria-label="Expand debugger"
        >
          <ChevronLeft className="w-4 h-4" />
          <span className="text-sm font-semibold">Open debugger</span>
        </button>
      )}
    </>
  );
};

export default DebuggerPanel;
