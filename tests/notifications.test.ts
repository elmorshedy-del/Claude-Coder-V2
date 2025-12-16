import { test, beforeEach } from 'node:test';
import assert from 'node:assert';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { normalizeMetaPayload } from '../src/lib/meta-notifications';
import { getNotificationStore } from '../src/lib/notification-store';
import { Notification } from '../src/types';
import { NextRequest } from 'next/server';

beforeEach(() => {
  // Ensure each test uses a unique store path so data does not leak
  const storePath = path.join(tmpdir(), `notifications-${Date.now()}-${Math.random()}.json`);
  process.env.NOTIFICATION_STORE_PATH = storePath;
});

test('normalizeMetaPayload converts Meta entries to notifications', () => {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    object: 'page',
    entry: [
      {
        time: now,
        changes: [
          {
            field: 'messages',
            value: { message: 'hello world', time: now },
          },
        ],
      },
    ],
  };

  const notifications = normalizeMetaPayload(payload) as Notification[];
  assert.strictEqual(notifications.length, 1);
  assert.strictEqual(notifications[0].message, 'hello world');
  assert.ok(notifications[0].createdAt);
});

test('meta webhook persists notifications and can be queried', async () => {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    object: 'page',
    entry: [
      {
        id: 'meta-page',
        time: now,
        changes: [
          {
            field: 'feed',
            value: { description: 'Meta test payload', time: now },
          },
        ],
      },
    ],
  };

  const { POST } = await import('../src/app/api/notifications/meta/route');
  const request = new NextRequest('http://localhost/api/notifications/meta', {
    method: 'POST',
    body: JSON.stringify(payload),
    headers: new Headers({ 'content-type': 'application/json' }),
  });

  const response = await POST(request);
  const body = await response.json();
  assert.strictEqual(body.success, true);
  assert.strictEqual(body.saved, 1);

  const notifications = await getNotificationStore().list();
  assert.strictEqual(notifications.length, 1);
  assert.strictEqual(notifications[0].message, 'Meta test payload');
  assert.ok(notifications[0].createdAt);
});
