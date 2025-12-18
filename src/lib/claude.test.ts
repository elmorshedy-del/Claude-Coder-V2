import assert from 'node:assert';
import test from 'node:test';
import { ClaudeClient, buildBetaHeaderValue, validateAnthropicRequestBody } from './claude';

function createStubbedClaudeClient() {
  const claude = new ClaudeClient('sk-ant-12345678901234567890');
  const calls: Array<{ params: Record<string, unknown>; options?: Record<string, any> }> = [];

  (claude as any).client = {
    messages: {
      create: async (params: any, options?: any) => {
        calls.push({ params, options });
        return {
          content: [{ type: 'text', text: 'ok' }],
          usage: { input_tokens: 1, output_tokens: 1 },
        } as any;
      },
    },
  };

  return { claude, calls };
}

test('toggles off => no beta header and no betas in body', async () => {
  const { claude, calls } = createStubbedClaudeClient();

  await claude.chat(
    [{ role: 'user', content: 'hello' }],
    '',
    '',
    { enableContextCompaction: false, enableMemory: false },
  );

  const lastCall = calls.at(-1);
  assert.ok(lastCall);
  assert.ok(!('betas' in lastCall!.params));
  assert.ok(!lastCall!.options?.headers?.['anthropic-beta']);
});

test('context compaction on => beta header applied', async () => {
  const { claude, calls } = createStubbedClaudeClient();

  await claude.chat(
    [{ role: 'user', content: 'hello' }],
    '',
    '',
    { enableContextCompaction: true },
  );

  const lastCall = calls.at(-1);
  assert.ok(lastCall);
  const header = lastCall!.options?.headers?.['anthropic-beta'];
  assert.ok(header?.includes('context-management-2025-06-27'));
  assert.ok(!('betas' in lastCall!.params));
});

test('memory on => beta header applied', async () => {
  const { claude, calls } = createStubbedClaudeClient();

  await claude.chat(
    [{ role: 'user', content: 'hello' }],
    '',
    '',
    { enableMemory: true },
  );

  const lastCall = calls.at(-1);
  assert.ok(lastCall);
  const header = lastCall!.options?.headers?.['anthropic-beta'];
  assert.ok(header?.includes('context-management-2025-06-27'));
  assert.ok(!('betas' in lastCall!.params));
});

test('guard rejects betas in body in development', () => {
  assert.throws(
    () => validateAnthropicRequestBody({ betas: ['should-not-send'], model: 'test' }, 'development'),
    /Forbidden Anthropic request keys detected/,
  );
});

test('beta header merge deduplicates values', () => {
  const merged = buildBetaHeaderValue(['context-management-2025-06-27'], 'context-management-2025-06-27');
  assert.strictEqual(merged, 'context-management-2025-06-27');
});
