import { NextRequest, NextResponse } from 'next/server';
import { getNotificationStore } from '@/lib/notification-store';
import { normalizeMetaPayload } from '@/lib/meta-notifications';

const VERIFY_TOKEN = process.env.META_VERIFY_TOKEN;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token && token === VERIFY_TOKEN && challenge) {
    console.info('[meta:webhook] Verification succeeded');
    return new Response(challenge, { status: 200 });
  }

  console.warn('[meta:webhook] Verification failed', { mode, token });
  return NextResponse.json({ error: 'Verification failed' }, { status: 403 });
}

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();
    console.info('[meta:webhook] Payload received', {
      entries: Array.isArray(payload?.entry) ? payload.entry.length : 0,
    });

    const notifications = normalizeMetaPayload(payload);

    if (notifications.length === 0) {
      console.warn('[meta:webhook] No notifications generated from payload');
      return NextResponse.json({ success: true, saved: 0 });
    }

    await getNotificationStore().addMany(notifications);
    console.info('[meta:webhook] Notifications saved', { count: notifications.length });

    return NextResponse.json({ success: true, saved: notifications.length });
  } catch (error) {
    console.error('[meta:webhook] Error processing webhook', error);
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }
}
