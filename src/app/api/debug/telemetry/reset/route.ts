import { NextResponse } from 'next/server';
import { recordServerEvent, resetTelemetrySnapshot } from '../state';

export async function POST() {
  const snapshot = resetTelemetrySnapshot();
  recordServerEvent({ type: 'telemetry', severity: 'info', message: 'Telemetry reset' });
  return NextResponse.json(snapshot);
}
