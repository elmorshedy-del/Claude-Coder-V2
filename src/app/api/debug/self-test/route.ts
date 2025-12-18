import { NextResponse } from 'next/server';
import { recordServerEvent, runSelfTest } from '../telemetry/state';

export async function POST() {
  const result = await runSelfTest();
  recordServerEvent({ type: 'self-test', severity: 'info', message: 'Self-test requested' });
  return NextResponse.json({ status: result.status, detail: result.detail, checks: result.checks });
}
