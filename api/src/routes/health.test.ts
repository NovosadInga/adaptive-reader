import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../app.ts';

const corsOrigin = 'http://localhost:5173';
const app = buildApp({ port: 0, host: '127.0.0.1', corsOrigin });
after(() => app.close());

test('GET /health answers 200 with status ok', async () => {
  const response = await app.inject({ method: 'GET', url: '/health' });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { status: 'ok' });
});

test('allows the configured frontend origin', async () => {
  const response = await app.inject({
    method: 'GET',
    url: '/health',
    headers: { origin: corsOrigin },
  });

  assert.equal(response.headers['access-control-allow-origin'], corsOrigin);
});

test('names the configured origin, not the requesting one, for any other origin', async () => {
  // With a fixed origin the header is always the configured value. A page on
  // another origin receives a header that does not match its own, and the
  // browser refuses the response — the decision is the browser's, the server
  // only declares whom it trusts.
  const response = await app.inject({
    method: 'GET',
    url: '/health',
    headers: { origin: 'https://evil.example' },
  });

  assert.equal(response.headers['access-control-allow-origin'], corsOrigin);
});
