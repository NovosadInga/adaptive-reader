import type { FastifyInstance } from 'fastify';

/**
 * `GET /health` — "the process is up". Used by the hosting platform's checks
 * and by a person who wants to know the server started. No dependencies are
 * probed: there is nothing behind the server yet (D19).
 */
export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async () => ({ status: 'ok' }));
}
