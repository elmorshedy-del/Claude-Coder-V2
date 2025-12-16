import { NextRequest, NextResponse } from 'next/server';
import { getNotificationStore } from '@/lib/notification-store';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const limitParam = searchParams.get('limit');
  const limit = limitParam ? Math.max(1, Math.min(parseInt(limitParam, 10) || 50, 200)) : 50;

  const notifications = await getNotificationStore().list(limit);
  return NextResponse.json({ notifications });
}
