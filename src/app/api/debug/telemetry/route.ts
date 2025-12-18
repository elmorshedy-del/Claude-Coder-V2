import { NextResponse } from 'next/server';
import {
  getTelemetrySnapshot,
  noteRequest,
  recordServerEvent,
  updateBuildInfo,
} from './state';

export async function GET() {
  const start = Date.now();

  const snapshot = getTelemetrySnapshot();
  updateBuildInfo(process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA, process.env.VERCEL_GIT_COMMIT_SHA);

  const duration = Date.now() - start;
  noteRequest('ok', duration);
  recordServerEvent({ type: 'telemetry', severity: 'info', message: 'Telemetry fetched' });

  return NextResponse.json(snapshot);
}
