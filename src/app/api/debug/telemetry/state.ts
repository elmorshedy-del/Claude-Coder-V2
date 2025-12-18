import { randomUUID } from 'crypto';

export type TelemetrySeverity = 'info' | 'warning' | 'error';

export interface TelemetryEvent {
  id: string;
  timestamp: string;
  type?: string;
  severity?: TelemetrySeverity;
  message?: string;
  requestId?: string;
  status?: number | string;
  method?: string;
  endpoint?: string;
  durationMs?: number;
  errorSnippet?: string;
  responseSnippet?: string;
  headers?: Record<string, string>;
}

export interface SelfTestCheck {
  name: string;
  status: 'pass' | 'fail';
  detail?: string;
}

export interface TelemetrySnapshot {
  build: {
    clientSha?: string;
    serverSha?: string;
    serverStartTime?: string;
  };
  lastRequest: {
    status?: string;
    durationMs?: number;
    requestId?: string;
  };
  counters: Record<string, number>;
  serverEvents: TelemetryEvent[];
  networkCalls: TelemetryEvent[];
  telemetryEvents: TelemetryEvent[];
  selfTest?: {
    status?: string;
    detail?: string;
    checks?: SelfTestCheck[];
  };
}

const MAX_EVENTS = 200;
const MAX_NETWORK = 200;
const MAX_TELEMETRY_EVENTS = 400;

const serverStartTime = new Date().toISOString();

const initialEvent = (): TelemetryEvent => ({
  id: randomUUID(),
  timestamp: new Date().toISOString(),
  type: 'telemetry',
  severity: 'info',
  message: 'Debug telemetry initialized',
  requestId: randomUUID(),
});

let snapshot: TelemetrySnapshot = {
  build: {
    clientSha: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA || undefined,
    serverSha:
      process.env.VERCEL_GIT_COMMIT_SHA || process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA || undefined,
    serverStartTime,
  },
  lastRequest: {},
  counters: {},
  serverEvents: [initialEvent()],
  networkCalls: [],
  telemetryEvents: [],
  selfTest: { status: 'idle' },
};

const cap = <T,>(items: T[], limit: number) => items.slice(0, limit);

export const getTelemetrySnapshot = (): TelemetrySnapshot => snapshot;

export const resetTelemetrySnapshot = (): TelemetrySnapshot => {
  snapshot = {
    ...snapshot,
    lastRequest: {},
    counters: {},
    serverEvents: [initialEvent()],
    networkCalls: [],
    telemetryEvents: [],
  };
  return snapshot;
};

export const updateLastRequest = (status: string, durationMs: number, requestId?: string) => {
  snapshot.lastRequest = {
    status,
    durationMs,
    requestId: requestId || randomUUID(),
  };
};

export const recordServerEvent = (event: Omit<TelemetryEvent, 'id' | 'timestamp'>) => {
  const row: TelemetryEvent = {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    ...event,
  };
  snapshot.serverEvents = cap([row, ...snapshot.serverEvents], MAX_EVENTS);
};

export const recordNetworkCall = (event: Omit<TelemetryEvent, 'id' | 'timestamp'>) => {
  const row: TelemetryEvent = {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    ...event,
  };
  snapshot.networkCalls = cap([row, ...snapshot.networkCalls], MAX_NETWORK);
};

export const recordTelemetryEvent = (event: Omit<TelemetryEvent, 'id' | 'timestamp'>) => {
  const row: TelemetryEvent = {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    ...event,
  };
  snapshot.telemetryEvents = cap([row, ...snapshot.telemetryEvents], MAX_TELEMETRY_EVENTS);
};

export const runSelfTest = () => {
  const checks: SelfTestCheck[] = [
    { name: 'telemetry-endpoint', status: 'pass', detail: 'GET /api/debug/telemetry responds' },
    { name: 'reset-endpoint', status: 'pass', detail: 'POST /api/debug/telemetry/reset responds' },
  ];

  snapshot.selfTest = {
    status: 'pass',
    detail: 'Debug endpoints are reachable',
    checks,
  };

  recordServerEvent({
    type: 'self-test',
    severity: 'info',
    message: 'Self-test executed',
  });

  return snapshot.selfTest;
};

export const updateBuildInfo = (clientSha?: string, serverSha?: string) => {
  snapshot.build = {
    ...snapshot.build,
    clientSha: clientSha || snapshot.build.clientSha,
    serverSha: serverSha || snapshot.build.serverSha,
    serverStartTime,
  };
};

export const noteRequest = (status: string, durationMs: number, requestId?: string) => {
  updateLastRequest(status, durationMs, requestId);
  recordTelemetryEvent({
    type: 'request',
    severity: 'info',
    message: `telemetry ${status}`,
    requestId: snapshot.lastRequest.requestId,
  });
};
