"use client";

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  DollarSign,
  CirclePause,
  CirclePlay,
  Copy,
  Download,
  Filter,
  Globe2,
  History,
  Loader2,
  RefreshCcw,
  Server,
  ShieldCheck,
  Table,
  Timer,
} from 'lucide-react';
import { useDebugger } from './DebuggerProvider';

const PANEL_WIDTH = 400;
const HANDLE_WIDTH = 44;
const POLL_INTERVAL = 2500;
const MAX_NETWORK = 200;
const MAX_EVENTS = 200;
const MAX_TELEMETRY_EVENTS = 400;

type DebuggerTab = 'Overview' | 'Activity Log' | 'Network' | 'Server Telemetry' | 'Self-test';

interface BuildInfo {
  clientSha?: string;
  serverSha?: string;
  serverStartTime?: string;
}

interface LastRequestInfo {
  status?: string;
  durationMs?: number;
  requestId?: string;
}

interface CounterMap {
  repoValidation?: number;
  truncation?: number;
  providerError?: number;
  guardrailSkipped?: number;
  [key: string]: number | undefined;
}

interface ServerEventRow {
  id: string;
  timestamp?: string;
  type?: string;
  severity?: 'info' | 'warning' | 'error';
  message?: string;
  requestId?: string;
}

interface NetworkCallRow {
  id: string;
  timestamp?: string;
  endpoint?: string;
  method?: string;
  status?: number | string;
  durationMs?: number;
  requestId?: string;
  errorSnippet?: string;
  responseSnippet?: string;
  headers?: Record<string, string>;
}

interface SelfTestCheck {
  name: string;
  status: 'pass' | 'fail';
  detail?: string;
}

interface TelemetryState {
  build: BuildInfo;
  lastRequest: LastRequestInfo;
  counters: CounterMap;
  serverEvents: ServerEventRow[];
  networkCalls: NetworkCallRow[];
  telemetryEvents: ServerEventRow[];
  selfTest?: { status?: string; checks?: SelfTestCheck[]; detail?: string };
}

const truncateText = (text?: string, max = 800) => {
  if (!text) return '';
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
};

const mergeRingBuffer = <T extends { id: string }>(incoming: T[], existing: T[], limit: number) => {
  const map = new Map<string, T>();
  [...incoming, ...existing].forEach((item) => {
    if (!map.has(item.id)) {
      map.set(item.id, item);
    }
  });
  return Array.from(map.values()).slice(0, limit);
};

const formatDuration = (value?: number) => {
  if (value === undefined || value === null || Number.isNaN(value)) return '–';
  return `${Math.round(value)}ms`;
};

const safeDate = (value?: string) => {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleString();
};

const Pill: React.FC<{ color?: string; children: React.ReactNode }> = ({ color = 'bg-[var(--claude-surface-sunken)]', children }) => (
  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium ${color}`}>{children}</span>
);

const CopyButton: React.FC<{ value?: string; label?: string }> = ({ value, label }) => {
  if (!value) return null;
  return (
    <button
      onClick={() => navigator.clipboard.writeText(value)}
      className="inline-flex items-center gap-1 text-xs text-[var(--claude-terracotta)] hover:underline"
      title="Copy to clipboard"
    >
      <Copy className="w-3 h-3" />
      {label || 'Copy'}
    </button>
  );
};

const DebuggerPanel: React.FC = () => {
  const { events } = useDebugger();
  const [collapsed, setCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<DebuggerTab>('Overview');
  const [isPolling, setIsPolling] = useState(true);
  const [expandedNetworkId, setExpandedNetworkId] = useState<string | null>(null);
  const [expandedActivityId, setExpandedActivityId] = useState<string | null>(null);
  const [telemetry, setTelemetry] = useState<TelemetryState>({
    build: {},
    lastRequest: {},
    counters: {},
    serverEvents: [],
    networkCalls: [],
    telemetryEvents: [],
  });
  const [telemetryError, setTelemetryError] = useState<string | null>(null);
  const [selfTestState, setSelfTestState] = useState<{ status: 'idle' | 'running' | 'pass' | 'fail'; checks?: SelfTestCheck[]; detail?: string }>(
    {
      status: 'idle',
    }
  );
  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const [telemetryFilters, setTelemetryFilters] = useState({ errorsOnly: false, requestId: '', type: '' });
  const [showApiInspector, setShowApiInspector] = useState(false);

  const statusStripCounters = useMemo(() => ({
    repoValidation: telemetry.counters.repoValidation ?? 0,
    truncation: telemetry.counters.truncation ?? telemetry.counters.trunc ?? 0,
    providerError: telemetry.counters.providerError ?? 0,
  }), [telemetry.counters]);

  const fetchTelemetry = async () => {
    try {
      const res = await fetch('/api/debug/telemetry', { cache: 'no-store' });
      if (!res.ok) {
        const message = res.status === 403 ? 'Debug telemetry is disabled (403)' : `Telemetry unavailable (${res.status})`;
        setTelemetryError(message);
        return;
      }

      const data = await res.json();
      const newNetwork: NetworkCallRow[] = Array.isArray(data.networkCalls || data.network)
        ? (data.networkCalls || data.network).map((item: any, idx: number) => ({
            id: item.id || item.requestId || crypto.randomUUID(),
            timestamp: item.timestamp || item.time,
            endpoint: item.endpoint || item.url,
            method: item.method || item.verb,
            status: item.status,
            durationMs: item.durationMs || item.duration_ms || item.duration,
            requestId: item.requestId || item.headers?.['x-request-id'],
            errorSnippet: item.errorSnippet || item.error,
            responseSnippet: item.responseSnippet || item.response,
            headers: item.headers || {},
          }))
        : [];

      const newServerEvents: ServerEventRow[] = Array.isArray(data.serverEvents || data.events)
        ? (data.serverEvents || data.events).map((item: any, idx: number) => ({
            id: item.id || item.requestId || crypto.randomUUID(),
            timestamp: item.timestamp,
            type: item.type || item.category,
            severity: item.severity || item.level,
            message: item.message || item.summary,
            requestId: item.requestId,
          }))
        : [];

      const newTelemetryEvents: ServerEventRow[] = Array.isArray(data.telemetryEvents)
        ? data.telemetryEvents.map((item: any, idx: number) => ({
            id: item.id || item.requestId || crypto.randomUUID(),
            timestamp: item.timestamp,
            type: item.type || item.category,
            severity: item.severity || item.level,
            message: item.message || item.summary,
            requestId: item.requestId,
          }))
        : [];

      setTelemetry((prev) => ({
        build: {
          clientSha: data.clientSha || data.build?.clientSha || prev.build.clientSha,
          serverSha: data.serverSha || data.build?.serverSha || prev.build.serverSha,
          serverStartTime: data.build?.serverStartTime || data.serverStartTime || prev.build.serverStartTime,
        },
        lastRequest: {
          status: data.lastRequest?.status || data.lastStatus || prev.lastRequest.status,
          durationMs: data.lastRequest?.durationMs || data.lastDurationMs || prev.lastRequest.durationMs,
          requestId: data.lastRequest?.requestId || data.lastRequestId || prev.lastRequest.requestId,
        },
        counters: {
          ...prev.counters,
          ...(data.counters || {}),
        },
        serverEvents: mergeRingBuffer(newServerEvents, prev.serverEvents, MAX_EVENTS),
        networkCalls: mergeRingBuffer(newNetwork, prev.networkCalls, MAX_NETWORK),
        telemetryEvents: mergeRingBuffer(newTelemetryEvents, prev.telemetryEvents, MAX_TELEMETRY_EVENTS),
        selfTest: data.selfTest || prev.selfTest,
      }));
      setTelemetryError(null);
    } catch (error) {
      setTelemetryError('Unable to load telemetry');
    }
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
    if (!isPolling || collapsed) {
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }
    fetchTelemetry();
    pollRef.current = setInterval(fetchTelemetry, POLL_INTERVAL);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [isPolling, collapsed]);

  const fallbackEvents: ServerEventRow[] = useMemo(
    () =>
      events.slice(0, 5).map((event) => ({
        id: event.id,
        timestamp: event.timestamp,
        type: event.category,
        severity: event.severity === 'Error' ? 'error' : event.severity === 'Warning' ? 'warning' : 'info',
        message: event.summary,
        requestId: (event.details as { requestId?: string })?.requestId,
      })),
    [events]
  );

  const displayServerEvents = telemetry.serverEvents.length > 0 ? telemetry.serverEvents : fallbackEvents;

  const lastFiveEvents = displayServerEvents.slice(0, 5);

  const mismatch = Boolean(
    telemetry.build.clientSha &&
    telemetry.build.serverSha &&
    telemetry.build.clientSha !== telemetry.build.serverSha
  );

  const handleSelfTest = async () => {
    setSelfTestState({ status: 'running' });
    try {
      const res = await fetch('/api/debug/self-test', { method: 'POST' });
      if (!res.ok) {
        const detail = res.status === 403 ? 'Self-test forbidden (403)' : `Self-test failed (${res.status})`;
        setSelfTestState({ status: 'fail', detail });
        return;
      }
      const payload = await res.json();
      const checks: SelfTestCheck[] = Array.isArray(payload.checks)
        ? payload.checks.map((item: any, idx: number) => ({
            name: item.name || `Check ${idx + 1}`,
            status: item.status === 'pass' ? 'pass' : 'fail',
            detail: item.detail,
          }))
        : [];
      setSelfTestState({ status: payload.status === 'pass' ? 'pass' : 'fail', checks, detail: payload.detail });
    } catch (error) {
      setSelfTestState({ status: 'fail', detail: 'Unable to run self-test' });
    }
  };

  const handleResetTelemetry = async () => {
    try {
      const res = await fetch('/api/debug/telemetry/reset', { method: 'POST' });
      if (!res.ok) {
        setTelemetryError(res.status === 403 ? 'Reset forbidden (403)' : 'Unable to reset telemetry');
        return;
      }
      await fetchTelemetry();
    } catch (error) {
      setTelemetryError('Unable to reset telemetry');
    }
  };

  const downloadDebugData = () => {
    const payload = {
      generatedAt: new Date().toISOString(),
      polling: isPolling,
      filters: telemetryFilters,
      limits: {
        network: MAX_NETWORK,
        events: MAX_EVENTS,
        telemetryEvents: MAX_TELEMETRY_EVENTS,
      },
      telemetry,
      displayServerEvents,
      fallbackEvents,
      rawEvents: events,
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `debug-console-export-${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const togglePolling = () => setIsPolling((prev) => !prev);

  const filteredTelemetryEvents = useMemo(() => {
    return (telemetry.telemetryEvents.length > 0 ? telemetry.telemetryEvents : displayServerEvents).filter((evt) => {
      if (telemetryFilters.errorsOnly && evt.severity !== 'error') return false;
      if (telemetryFilters.requestId && evt.requestId !== telemetryFilters.requestId) return false;
      if (telemetryFilters.type && evt.type !== telemetryFilters.type) return false;
      return true;
    });
  }, [telemetry.telemetryEvents, displayServerEvents, telemetryFilters]);

  const activeRequestId = telemetry.lastRequest.requestId || telemetry.networkCalls[0]?.requestId;

  const networkWithFallback = telemetry.networkCalls.length > 0 ? telemetry.networkCalls : [];

  const activityByCategory = useMemo(() => {
    const buckets: Record<string, number> = {};
    events.forEach((evt) => {
      buckets[evt.category] = (buckets[evt.category] || 0) + 1;
    });
    return buckets;
  }, [events]);

  const errorEvents = useMemo(() => events.filter((evt) => evt.severity === 'Error'), [events]);
  const latestError = errorEvents[0];

  const toolEvents = useMemo(() => events.filter((evt) => evt.category === 'Tool'), [events]);
  const roundEvents = useMemo(() => events.filter((evt) => typeof (evt.details as { round?: number })?.round === 'number'), [events]);
  const latestStop = events.find((evt) => evt.title === 'Loop stopped');
  const costEvents = useMemo(
    () => events.filter((evt) => typeof (evt.details as { cost?: number })?.cost === 'number'),
    [events]
  );

  const healthStatus: 'green' | 'yellow' | 'red' = latestError
    ? 'red'
    : telemetryError || events.some((evt) => evt.severity === 'Warning')
    ? 'yellow'
    : 'green';

  return (
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
          <div className="sticky top-0 z-20 border-b border-[var(--claude-border)] bg-[var(--claude-surface)] px-3 py-2 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="flex flex-col">
                <div className="text-[10px] uppercase tracking-wide text-[var(--claude-text-muted)]">Build</div>
                <div className="flex items-center gap-2 text-sm text-[var(--claude-text)]">
                  <span className="font-mono">Client {telemetry.build.clientSha || 'unknown'}</span>
                  <span className="text-[var(--claude-text-muted)]">/</span>
                  <span className="font-mono">Server {telemetry.build.serverSha || 'unknown'}</span>
                  {mismatch && <Pill color="bg-red-100 text-red-800">MISMATCH</Pill>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={togglePolling}
                  className="inline-flex items-center gap-1 rounded-full border border-[var(--claude-border)] px-2 py-1 text-xs text-[var(--claude-text)] hover:bg-[var(--claude-surface-sunken)]"
                >
                  {isPolling ? <CirclePause className="w-3 h-3" /> : <CirclePlay className="w-3 h-3" />}
                  {isPolling ? 'Pause' : 'Resume'}
                </button>
              </div>
            </div>
            <div className="mt-2 flex items-center justify-between text-xs text-[var(--claude-text)]">
              <div className="flex items-center gap-2">
                <span className="font-semibold">Last Request:</span>
                <span className="font-mono">
                  {telemetry.lastRequest.status || 'unknown'} {formatDuration(telemetry.lastRequest.durationMs)}{' '}
                  {telemetry.lastRequest.requestId ? ` ${telemetry.lastRequest.requestId}` : ''}
                </span>
              </div>
              <div className="font-mono">
                RepoVal: {statusStripCounters.repoValidation} | Trunc: {statusStripCounters.truncation} | ProviderErr: {statusStripCounters.providerError}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--claude-border)] bg-[var(--claude-surface)]">
            <div className="flex items-center gap-2 text-[var(--claude-text)]">
              <Filter className="w-4 h-4" />
              <span className="font-semibold text-sm">Debug Console</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-[var(--claude-text-muted)]">
              <Server className="w-4 h-4" />
              <span>{safeDate(telemetry.build.serverStartTime) || 'server start unknown'}</span>
            </div>
          </div>

          <div className="px-3 pt-3 flex flex-wrap gap-2">
            {(['Overview', 'Activity Log', 'Network', 'Server Telemetry', 'Self-test'] as DebuggerTab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`rounded-full px-3 py-1 text-xs font-medium border ${
                  activeTab === tab
                    ? 'bg-[var(--claude-terracotta)] text-white border-[var(--claude-terracotta)]'
                    : 'border-[var(--claude-border)] text-[var(--claude-text)] hover:bg-[var(--claude-surface-sunken)]'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {telemetryError && (
              <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                <AlertTriangle className="w-4 h-4" />
                <span>{telemetryError}</span>
              </div>
            )}

            {activeTab === 'Overview' && (
              <div className="space-y-3">
                <div className="rounded-lg border border-[var(--claude-border)] bg-[var(--claude-surface)] p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-[var(--claude-text)]">
                      <span
                        className={`w-3 h-3 rounded-full ${
                          healthStatus === 'green'
                            ? 'bg-emerald-500'
                            : healthStatus === 'yellow'
                            ? 'bg-amber-500'
                            : 'bg-red-500'
                        }`}
                        aria-label={`Session health: ${healthStatus}`}
                      />
                      <span className="font-semibold">Session health</span>
                    </div>
                    <div className="text-xs text-[var(--claude-text-muted)]">
                      {latestError ? 'Errors present' : healthStatus === 'yellow' ? 'Warnings detected' : 'Healthy'}
                    </div>
                  </div>
                  {latestError && (
                    <div className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-800">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold">{latestError.title}</span>
                        <span className="text-[var(--claude-text-muted)]">{new Date(latestError.timestamp).toLocaleTimeString()}</span>
                      </div>
                      <div className="mt-1">{latestError.summary}</div>
                      {latestError.details && (latestError.details as { stack?: string; message?: string }).stack && (
                        <pre className="mt-2 max-h-24 overflow-y-auto whitespace-pre-wrap rounded bg-white p-2 font-mono text-[11px] text-red-700">
                          {(latestError.details as { stack?: string }).stack}
                        </pre>
                      )}
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-2 text-xs text-[var(--claude-text)]">
                    <div className="rounded-md bg-[var(--claude-surface-sunken)] p-2">
                      <div className="text-[var(--claude-text-muted)]">Loop status</div>
                      <div className="font-semibold">{latestStop?.summary || 'Running'}</div>
                      {roundEvents[0] && (
                        <div className="text-[var(--claude-text-muted)]">Round {(
                          roundEvents[0].details as { round?: number }
                        )?.round}</div>
                      )}
                    </div>
                    <div className="rounded-md bg-[var(--claude-surface-sunken)] p-2">
                      <div className="text-[var(--claude-text-muted)]">Request status</div>
                      <div className="font-semibold">{telemetry.lastRequest.status || 'Unknown'}</div>
                      <div className="text-[var(--claude-text-muted)]">{formatDuration(telemetry.lastRequest.durationMs)}</div>
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-[var(--claude-border)] bg-[var(--claude-surface-sunken)] p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-[var(--claude-text)]">
                      <Globe2 className="w-4 h-4" />
                      <span className="font-semibold">Build fingerprints</span>
                    </div>
                    {mismatch && <Pill color="bg-red-100 text-red-800">Client/Server mismatch</Pill>}
                  </div>
                  <div className="mt-2 grid grid-cols-1 gap-2 text-sm text-[var(--claude-text)]">
                    <div className="flex items-center justify-between font-mono">
                      <span>Client SHA</span>
                      <span>{telemetry.build.clientSha || 'unknown'}</span>
                    </div>
                    <div className="flex items-center justify-between font-mono">
                      <span>Server SHA</span>
                      <span>{telemetry.build.serverSha || 'unknown'}</span>
                    </div>
                    <div className="flex items-center justify-between font-mono text-[var(--claude-text-muted)]">
                      <span>Server started</span>
                      <span>{safeDate(telemetry.build.serverStartTime) || 'unknown'}</span>
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-[var(--claude-border)] bg-[var(--claude-surface)] p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-[var(--claude-text)]">
                      <History className="w-4 h-4" />
                      <span className="font-semibold">Recent server events</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-[var(--claude-text-muted)]">
                      <Timer className="w-4 h-4" />
                      <span>Showing last 5</span>
                    </div>
                  </div>
                  <div className="mt-2 space-y-2">
                    {lastFiveEvents.length === 0 && (
                      <div className="text-xs text-[var(--claude-text-muted)]">No events yet.</div>
                    )}
                    {lastFiveEvents.map((evt) => (
                      <div
                        key={evt.id}
                        className="rounded-md border border-[var(--claude-border)] bg-[var(--claude-surface-sunken)] p-2 text-xs text-[var(--claude-text)]"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Pill
                              color={
                                evt.severity === 'error'
                                  ? 'bg-red-100 text-red-800'
                                  : evt.severity === 'warning'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-blue-100 text-blue-800'
                              }
                            >
                              {evt.type || 'event'}
                            </Pill>
                            <span>{evt.message || 'No message'}</span>
                          </div>
                          <div className="flex items-center gap-2 text-[var(--claude-text-muted)]">
                            <span>{evt.timestamp ? new Date(evt.timestamp).toLocaleTimeString() : ''}</span>
                            <CopyButton value={evt.requestId} label={evt.requestId} />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-lg border border-[var(--claude-border)] bg-[var(--claude-surface)] p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-[var(--claude-text)]">
                      <Timer className="w-4 h-4" />
                      <span className="font-semibold">Tool execution dashboard</span>
                    </div>
                    <div className="text-xs text-[var(--claude-text-muted)]">Slow calls & failures surface here</div>
                  </div>
                  <div className="mt-2 space-y-2 max-h-64 overflow-y-auto">
                    {toolEvents.length === 0 && (
                      <div className="text-xs text-[var(--claude-text-muted)]">No tool calls recorded yet.</div>
                    )}
                    {toolEvents.map((evt) => {
                      const slow = (evt.duration_ms || 0) > 5000;
                      const details = evt.details as { tool?: string; input?: unknown; output?: unknown; callId?: string };
                      return (
                        <div
                          key={evt.id}
                          className={`rounded-md border ${
                            slow ? 'border-amber-200 bg-amber-50' : 'border-[var(--claude-border)] bg-[var(--claude-surface-sunken)]'
                          } p-2 text-xs text-[var(--claude-text)]`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Pill color={evt.severity === 'Error' ? 'bg-red-100 text-red-800' : undefined}>
                                {details.tool || evt.title}
                              </Pill>
                              <span className="font-semibold">{evt.summary}</span>
                            </div>
                            <div className="flex items-center gap-2 text-[var(--claude-text-muted)]">
                              <span>{formatDuration(evt.duration_ms)}</span>
                              {slow && <Pill color="bg-amber-100 text-amber-800">Slow</Pill>}
                            </div>
                          </div>
                          <div className="mt-1 grid grid-cols-2 gap-2">
                            {details.input !== undefined && details.input !== null && (
                              <div>
                                <div className="text-[var(--claude-text-muted)]">Input</div>
                                <pre className="max-h-20 overflow-y-auto whitespace-pre-wrap rounded bg-white p-2 font-mono text-[11px]">{truncateText(JSON.stringify(details.input, null, 2), 400)}</pre>
                              </div>
                            )}
                            {details.output !== undefined && details.output !== null && (
                              <div>
                                <div className="text-[var(--claude-text-muted)]">Output</div>
                                <pre className="max-h-20 overflow-y-auto whitespace-pre-wrap rounded bg-white p-2 font-mono text-[11px]">{truncateText(JSON.stringify(details.output, null, 2), 400)}</pre>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="rounded-lg border border-[var(--claude-border)] bg-[var(--claude-surface-sunken)] p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-[var(--claude-text)]">
                      <DollarSign className="w-4 h-4" />
                      <span className="font-semibold">Cost breakdown</span>
                    </div>
                    <div className="text-xs text-[var(--claude-text-muted)]">Per-round costs where available</div>
                  </div>
                  <div className="mt-2 space-y-2">
                    {costEvents.length === 0 && <div className="text-xs text-[var(--claude-text-muted)]">No cost telemetry recorded.</div>}
                    {costEvents.map((evt) => {
                      const details = evt.details as { cost?: number; savedPercent?: number; round?: number; note?: string };
                      const expensive = (details.cost || 0) >= 0.1;
                      return (
                        <div
                          key={evt.id}
                          className={`flex items-center justify-between rounded-md border ${
                            expensive ? 'border-amber-200 bg-amber-50' : 'border-[var(--claude-border)] bg-white'
                          } p-2 text-xs text-[var(--claude-text)]`}
                        >
                          <div className="flex flex-col">
                            <span className="font-semibold">{details.round ? `Round ${details.round}` : evt.title}</span>
                            <span className="text-[var(--claude-text-muted)]">{details.note || evt.summary}</span>
                          </div>
                          <div className="text-right font-mono">
                            <div className="font-semibold">${(details.cost || 0).toFixed(2)}</div>
                            {details.savedPercent !== undefined && (
                              <div className="text-[var(--claude-text-muted)]">Saved {details.savedPercent}%</div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="rounded-lg border border-[var(--claude-border)] bg-[var(--claude-surface-sunken)] p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-[var(--claude-text)]">
                      <ShieldCheck className="w-4 h-4" />
                      <span className="font-semibold">Actions</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-[var(--claude-text-muted)]">
                      <span>Live updates {isPolling ? 'on' : 'paused'}</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={handleSelfTest}
                      className="inline-flex items-center gap-2 rounded-md border border-[var(--claude-border)] bg-white px-3 py-2 text-sm text-[var(--claude-text)] hover:bg-[var(--claude-surface)]"
                    >
                      {selfTestState.status === 'running' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                      Run self-test
                    </button>
                  <button
                    onClick={handleResetTelemetry}
                    className="inline-flex items-center gap-2 rounded-md border border-[var(--claude-border)] bg-white px-3 py-2 text-sm text-[var(--claude-text)] hover:bg-[var(--claude-surface)]"
                  >
                    <RefreshCcw className="w-4 h-4" />
                    Reset telemetry
                  </button>
                  <button
                    onClick={downloadDebugData}
                    className="inline-flex items-center gap-2 rounded-md border border-[var(--claude-border)] bg-white px-3 py-2 text-sm text-[var(--claude-text)] hover:bg-[var(--claude-surface)]"
                  >
                    <Download className="w-4 h-4" />
                    Download full debug log
                  </button>
                  <button
                    onClick={() => setShowApiInspector((prev) => !prev)}
                    className="inline-flex items-center gap-2 rounded-md border border-[var(--claude-border)] bg-white px-3 py-2 text-sm text-[var(--claude-text)] hover:bg-[var(--claude-surface)]"
                  >
                    <Table className="w-4 h-4" />
                    {showApiInspector ? 'Hide API inspector' : 'Show API inspector'}
                  </button>
                </div>
                {showApiInspector && (
                  <div className="rounded-md border border-[var(--claude-border)] bg-white p-2 text-xs text-[var(--claude-text)] space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Server className="w-4 h-4" />
                        <span className="font-semibold">Last API request</span>
                      </div>
                      <span className="text-[var(--claude-text-muted)]">{networkWithFallback[0]?.timestamp}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded bg-[var(--claude-surface-sunken)] p-2">
                        <div className="text-[var(--claude-text-muted)]">Model/Endpoint</div>
                        <div className="font-mono break-words">{networkWithFallback[0]?.endpoint || 'Unknown'}</div>
                      </div>
                      <div className="rounded bg-[var(--claude-surface-sunken)] p-2">
                        <div className="text-[var(--claude-text-muted)]">Status</div>
                        <div className="font-mono">{networkWithFallback[0]?.status || 'Unknown'}</div>
                      </div>
                    </div>
                    {networkWithFallback[0]?.headers && (
                      <div>
                        <div className="text-[var(--claude-text-muted)]">Headers</div>
                        <pre className="max-h-32 overflow-y-auto whitespace-pre-wrap rounded bg-[var(--claude-surface-sunken)] p-2 font-mono">{JSON.stringify(networkWithFallback[0]?.headers, null, 2)}</pre>
                      </div>
                    )}
                    {networkWithFallback[0]?.responseSnippet && (
                      <div>
                        <div className="text-[var(--claude-text-muted)]">Response</div>
                        <pre className="max-h-32 overflow-y-auto whitespace-pre-wrap rounded bg-[var(--claude-surface-sunken)] p-2 font-mono">{truncateText(networkWithFallback[0]?.responseSnippet, 1200)}</pre>
                      </div>
                    )}
                  </div>
                )}
                {selfTestState.status !== 'idle' && (
                  <div className="rounded-md border border-[var(--claude-border)] bg-white p-2 text-xs text-[var(--claude-text)]">
                    <div className="flex items-center gap-2 font-medium">
                      {selfTestState.status === 'pass' && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
                        {selfTestState.status === 'fail' && <AlertTriangle className="w-4 h-4 text-red-600" />}
                        {selfTestState.status === 'running' && <Loader2 className="w-4 h-4 animate-spin" />}
                        <span>Self-test {selfTestState.status.toUpperCase()}</span>
                      </div>
                      {selfTestState.detail && <div className="mt-1 text-[var(--claude-text-muted)]">{selfTestState.detail}</div>}
                      {selfTestState.checks && selfTestState.checks.length > 0 && (
                        <ul className="mt-2 space-y-1">
                          {selfTestState.checks.map((check, idx) => (
                            <li key={idx} className="flex items-center justify-between">
                              <span>{check.name}</span>
                              <span className={check.status === 'pass' ? 'text-emerald-600' : 'text-red-600'}>{check.status.toUpperCase()}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'Activity Log' && (
              <div className="space-y-3">
                <div className="rounded-lg border border-[var(--claude-border)] bg-[var(--claude-surface-sunken)] p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-[var(--claude-text)]">
                      <History className="w-4 h-4" />
                      <span className="font-semibold">Recent actions</span>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-[var(--claude-text-muted)]">
                      <span className="uppercase tracking-wide">By type</span>
                      <div className="flex flex-wrap gap-1">
                        {Object.entries(activityByCategory).map(([category, count]) => (
                          <Pill key={category}>{`${category}: ${count}`}</Pill>
                        ))}
                        {events.length === 0 && <span>None logged yet</span>}
                      </div>
                    </div>
                  </div>
                  {latestError && (
                    <div className="mt-2 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold">{latestError.summary}</span>
                        <span>{new Date(latestError.timestamp).toLocaleTimeString()}</span>
                      </div>
                      {latestError.details && (latestError.details as { stack?: string }).stack && (
                        <pre className="mt-1 max-h-32 overflow-y-auto whitespace-pre-wrap rounded bg-white p-2 font-mono text-[11px] text-red-700">
                          {(latestError.details as { stack?: string }).stack}
                        </pre>
                      )}
                    </div>
                  )}
                  <div className="mt-2 space-y-2 max-h-96 overflow-y-auto">
                    {events.length === 0 && (
                      <div className="text-xs text-[var(--claude-text-muted)]">
                        Actions, file reads, and tool usage will appear here once recorded.
                      </div>
                    )}
                    {events.map((evt) => {
                      const expanded = expandedActivityId === evt.id;
                      return (
                        <div
                          key={evt.id}
                          className="rounded-md border border-[var(--claude-border)] bg-[var(--claude-surface)] p-2 text-xs text-[var(--claude-text)]"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <Pill>{evt.category}</Pill>
                              <Pill
                                color={
                                  evt.severity === 'Error'
                                    ? 'bg-red-100 text-red-800'
                                    : evt.severity === 'Warning'
                                    ? 'bg-amber-100 text-amber-800'
                                    : 'bg-blue-100 text-blue-800'
                                }
                              >
                                {evt.severity}
                              </Pill>
                              <span className="font-semibold">{evt.title}</span>
                            </div>
                            <div className="flex items-center gap-2 text-[var(--claude-text-muted)]">
                              <span>{new Date(evt.timestamp).toLocaleTimeString()}</span>
                              {evt.duration_ms !== undefined && <span>{formatDuration(evt.duration_ms)}</span>}
                              <button
                                onClick={() =>
                                  setExpandedActivityId((prev) => (prev === evt.id ? null : evt.id))
                                }
                                className="rounded-full border border-[var(--claude-border)] px-2 py-1 text-[var(--claude-text)] hover:bg-[var(--claude-surface-sunken)]"
                              >
                                {expanded ? 'Hide' : 'Details'}
                              </button>
                            </div>
                          </div>
                          <div className="mt-1 text-[var(--claude-text-muted)]">{evt.summary}</div>
                          {expanded && (
                            <pre className="mt-2 whitespace-pre-wrap rounded-md bg-[var(--claude-surface-sunken)] p-2 text-[11px] text-[var(--claude-text)]">
                              {JSON.stringify(evt.details || {}, null, 2)}
                            </pre>
                          )}
                          {evt.related && evt.related.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1 text-[10px] text-[var(--claude-text-muted)]">
                              {evt.related.map((ref) => (
                                <Pill key={ref} color="bg-[var(--claude-surface-sunken)] text-[var(--claude-text)]">
                                  {ref}
                                </Pill>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'Network' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs text-[var(--claude-text-muted)]">
                  <div className="flex items-center gap-2">
                    <Table className="w-4 h-4" />
                    <span>Last {Math.min(networkWithFallback.length, MAX_NETWORK)} client API calls</span>
                  </div>
                  <span>Click a row to expand details</span>
                </div>
                <div className="divide-y divide-[var(--claude-border)] rounded-lg border border-[var(--claude-border)] bg-[var(--claude-surface-sunken)]">
                  {networkWithFallback.length === 0 && (
                    <div className="p-3 text-xs text-[var(--claude-text-muted)]">No network calls yet.</div>
                  )}
                  {networkWithFallback.map((call) => {
                    const expanded = expandedNetworkId === call.id;
                    return (
                      <div key={call.id} className="p-3 hover:bg-[var(--claude-surface)]">
                        <button
                          onClick={() => setExpandedNetworkId(expanded ? null : call.id)}
                          className="w-full text-left"
                        >
                          <div className="flex items-center justify-between text-sm text-[var(--claude-text)]">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-[var(--claude-text-muted)]">{call.timestamp ? new Date(call.timestamp).toLocaleTimeString() : ''}</span>
                              <span className="font-semibold">{call.method || 'N/A'}</span>
                              <span className="font-mono">{call.endpoint || 'unknown endpoint'}</span>
                            </div>
                            <div className="flex items-center gap-3 text-xs text-[var(--claude-text-muted)]">
                              <span>{call.status || 'unknown'}</span>
                              <span>{formatDuration(call.durationMs)}</span>
                              <span className="font-mono">{call.requestId || 'no req id'}</span>
                              <ChevronDown className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                            </div>
                          </div>
                        </button>
                        {expanded && (
                          <div className="mt-2 rounded-md border border-[var(--claude-border)] bg-white p-2 text-xs text-[var(--claude-text)] space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="font-mono">Request ID: {call.requestId || 'unknown'}</span>
                              <CopyButton value={call.requestId} />
                            </div>
                            {call.errorSnippet && (
                              <div>
                                <div className="font-semibold mb-1 text-[var(--claude-text)]">Error</div>
                                <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded bg-[var(--claude-surface-sunken)] p-2 font-mono">{truncateText(call.errorSnippet, 1000)}</pre>
                              </div>
                            )}
                            {call.responseSnippet && (
                              <div>
                                <div className="font-semibold mb-1 text-[var(--claude-text)]">Response</div>
                                <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded bg-[var(--claude-surface-sunken)] p-2 font-mono">{truncateText(call.responseSnippet, 1000)}</pre>
                              </div>
                            )}
                            {call.headers && Object.keys(call.headers).length > 0 && (
                              <div>
                                <div className="font-semibold mb-1 text-[var(--claude-text)]">Headers</div>
                                <div className="space-y-1">
                                  {Object.entries(call.headers).map(([key, val]) => (
                                    <div key={key} className="flex items-center justify-between">
                                      <span className="font-medium">{key}</span>
                                      <span className="font-mono text-[var(--claude-text-muted)]">{truncateText(String(val), 200)}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {activeTab === 'Server Telemetry' && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries({
                    RepoValidation: telemetry.counters.repoValidation ?? 0,
                    Truncation: telemetry.counters.truncation ?? telemetry.counters.trunc ?? 0,
                    GuardrailSkipped: telemetry.counters.guardrailSkipped ?? 0,
                    ProviderError: telemetry.counters.providerError ?? 0,
                  }).map(([label, value]) => (
                    <div key={label} className="rounded-lg border border-[var(--claude-border)] bg-[var(--claude-surface-sunken)] p-3">
                      <div className="text-xs text-[var(--claude-text-muted)]">{label}</div>
                      <div className="text-xl font-semibold text-[var(--claude-text)]">{value}</div>
                    </div>
                  ))}
                </div>

                <div className="rounded-lg border border-[var(--claude-border)] bg-[var(--claude-surface)] p-3 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-[var(--claude-text)]">
                      <AlertCircle className="w-4 h-4" />
                      <span className="font-semibold">Event stream</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <label className="flex items-center gap-1 text-[var(--claude-text)]">
                        <input
                          type="checkbox"
                          checked={telemetryFilters.errorsOnly}
                          onChange={(e) => setTelemetryFilters((prev) => ({ ...prev, errorsOnly: e.target.checked }))}
                        />
                        Errors only
                      </label>
                      <button
                        onClick={() => setTelemetryFilters((prev) => ({ ...prev, requestId: prev.requestId ? '' : activeRequestId || '' }))}
                        className="rounded-full border border-[var(--claude-border)] px-2 py-1 text-[var(--claude-text)] hover:bg-[var(--claude-surface-sunken)]"
                      >
                        {telemetryFilters.requestId ? 'All requests' : 'This requestId'}
                      </button>
                      <select
                        className="rounded-md border border-[var(--claude-border)] bg-white px-2 py-1 text-[var(--claude-text)]"
                        value={telemetryFilters.type}
                        onChange={(e) => setTelemetryFilters((prev) => ({ ...prev, type: e.target.value }))}
                      >
                        <option value="">All types</option>
                        <option value="error">Error</option>
                        <option value="warning">Warning</option>
                        <option value="info">Info</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-2 max-h-80 overflow-y-auto">
                    {filteredTelemetryEvents.length === 0 && (
                      <div className="text-xs text-[var(--claude-text-muted)]">No telemetry events.</div>
                    )}
                    {filteredTelemetryEvents.map((evt) => (
                      <div key={evt.id} className="rounded-md border border-[var(--claude-border)] bg-[var(--claude-surface-sunken)] p-2 text-xs text-[var(--claude-text)]">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Pill
                              color={
                                evt.severity === 'error'
                                  ? 'bg-red-100 text-red-800'
                                  : evt.severity === 'warning'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-blue-100 text-blue-800'
                              }
                            >
                              {evt.type || 'event'}
                            </Pill>
                            <span>{evt.message || 'No message'}</span>
                          </div>
                          <div className="flex items-center gap-2 text-[var(--claude-text-muted)]">
                            <span>{evt.timestamp ? new Date(evt.timestamp).toLocaleTimeString() : ''}</span>
                            <CopyButton value={evt.requestId} label={evt.requestId} />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'Self-test' && (
              <div className="space-y-3">
                <div className="rounded-lg border border-[var(--claude-border)] bg-[var(--claude-surface)] p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-[var(--claude-text)]">
                      <ShieldCheck className="w-4 h-4" />
                      <span className="font-semibold">Run self-test</span>
                    </div>
                    <button
                      onClick={handleSelfTest}
                      className="inline-flex items-center gap-2 rounded-md border border-[var(--claude-border)] bg-white px-3 py-2 text-sm text-[var(--claude-text)] hover:bg-[var(--claude-surface)]"
                    >
                      {selfTestState.status === 'running' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                      Run
                    </button>
                  </div>
                  <div className="mt-2 text-xs text-[var(--claude-text-muted)]">
                    Results render even if provider credits are insufficient.
                  </div>
                  {selfTestState.status !== 'idle' && (
                    <div className="mt-3 space-y-2">
                      <div className="flex items-center gap-2 text-[var(--claude-text)]">
                        {selfTestState.status === 'pass' && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
                        {selfTestState.status === 'fail' && <AlertTriangle className="w-4 h-4 text-red-600" />}
                        {selfTestState.status === 'running' && <Loader2 className="w-4 h-4 animate-spin" />}
                        <span className="font-semibold">Self-test {selfTestState.status.toUpperCase()}</span>
                      </div>
                      {selfTestState.detail && <div className="text-xs text-[var(--claude-text-muted)]">{selfTestState.detail}</div>}
                      {selfTestState.checks && selfTestState.checks.length > 0 && (
                        <div className="rounded-md border border-[var(--claude-border)] bg-[var(--claude-surface-sunken)] p-2">
                          <div className="text-[var(--claude-text)] font-medium mb-1">Checks</div>
                          <ul className="space-y-1 text-xs">
                            {selfTestState.checks.map((check, idx) => (
                              <li key={idx} className="flex items-center justify-between">
                                <span>{check.name}</span>
                                <span className={check.status === 'pass' ? 'text-emerald-600' : 'text-red-600'}>{check.status.toUpperCase()}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
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
    </div>
  );
};

export default DebuggerPanel;
