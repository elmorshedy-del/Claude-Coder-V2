import { Notification } from '@/types';

interface MetaEntryChange {
  field?: string;
  value?: Record<string, unknown> & { message?: string; description?: string; time?: number; item?: string; verb?: string };
}

interface MetaEntry {
  id?: string;
  time?: number;
  changes?: MetaEntryChange[];
  messaging?: unknown[];
}

interface MetaPayload {
  object?: string;
  entry?: MetaEntry[];
}

function resolveTimestamp(entryTime?: number, changeTime?: number): string {
  const timestamp = changeTime ?? entryTime;
  if (timestamp) {
    return new Date(timestamp * 1000).toISOString();
  }
  return new Date().toISOString();
}

function resolveMessage(change: MetaEntryChange): string {
  const candidate = change.value?.message
    ?? change.value?.description
    ?? change.value?.verb
    ?? change.value?.item;

  if (typeof candidate === 'string' && candidate.trim().length > 0) {
    return candidate;
  }

  return 'Meta notification received';
}

export function normalizeMetaPayload(payload: MetaPayload): Array<Omit<Notification, 'id'>> {
  const entries = Array.isArray(payload.entry) ? payload.entry : [];
  const notifications: Array<Omit<Notification, 'id'>> = [];

  entries.forEach((entry) => {
    const entryTime = entry.time;

    if (Array.isArray(entry.changes) && entry.changes.length > 0) {
      entry.changes.forEach((change) => {
        const createdAt = resolveTimestamp(entryTime, change.value?.time as number | undefined);
        notifications.push({
          source: 'meta',
          channel: change.field || (change.value?.item as string | undefined),
          message: resolveMessage(change),
          createdAt,
          rawPayload: change.value,
        });
      });
      return;
    }

    if (Array.isArray(entry.messaging) && entry.messaging.length > 0) {
      entry.messaging.forEach((message: any) => {
        const createdAt = resolveTimestamp(entryTime, message.timestamp);
        const text = message.message?.text || message.standby?.[0]?.message?.text;
        notifications.push({
          source: 'meta',
          channel: 'messaging',
          message: typeof text === 'string' && text.length > 0 ? text : 'Meta message received',
          createdAt,
          rawPayload: message,
        });
      });
      return;
    }

    notifications.push({
      source: 'meta',
      channel: 'meta',
      message: 'Meta webhook event received',
      createdAt: resolveTimestamp(entryTime),
      rawPayload: entry as Record<string, unknown>,
    });
  });

  return notifications;
}
