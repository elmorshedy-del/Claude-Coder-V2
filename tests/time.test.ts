import { test } from 'node:test';
import assert from 'node:assert';
import { formatRelativeTime } from '../src/lib/time';

test('formatRelativeTime returns minute and hour strings', () => {
  const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
  const unknown = 'not-a-date';

  assert.strictEqual(formatRelativeTime(twoMinutesAgo), '2m');
  assert.strictEqual(formatRelativeTime(threeHoursAgo), '3h');
  assert.strictEqual(formatRelativeTime(unknown), 'unknown');
});
