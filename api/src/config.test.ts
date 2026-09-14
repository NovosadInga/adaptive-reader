import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ConfigError, loadConfig } from './config.ts';

const full = { PORT: '4000', HOST: '0.0.0.0', CORS_ORIGIN: 'https://reader.example' };

test('reads every variable from the environment', () => {
  assert.deepEqual(loadConfig(full), {
    port: 4000,
    host: '0.0.0.0',
    corsOrigin: 'https://reader.example',
  });
});

test('falls back to loopback and port 3000 when PORT and HOST are absent', () => {
  assert.deepEqual(loadConfig({ CORS_ORIGIN: 'http://localhost:5173' }), {
    port: 3000,
    host: '127.0.0.1',
    corsOrigin: 'http://localhost:5173',
  });
});

test('refuses to start without CORS_ORIGIN and names the variable', () => {
  assert.throws(
    () => loadConfig({ PORT: '3000' }),
    (error: unknown) => error instanceof ConfigError && /CORS_ORIGIN/.test(error.message),
  );
});

test('treats a blank required variable as missing', () => {
  assert.throws(() => loadConfig({ CORS_ORIGIN: '   ' }), ConfigError);
});

test('rejects a PORT that is not a valid port number', () => {
  for (const PORT of ['abc', '0', '70000', '80.5']) {
    assert.throws(() => loadConfig({ ...full, PORT }), ConfigError, `PORT=${PORT}`);
  }
});
