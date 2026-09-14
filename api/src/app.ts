import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import type { Config } from './config.ts';
import { healthRoutes } from './routes/health.ts';

/**
 * Assembles the application without starting it: Fastify instance, plugins,
 * routes. `server.ts` is the only place that listens on a port, so tests can
 * build the app and send requests to it in memory through `app.inject()`.
 */
export function buildApp(config: Config): FastifyInstance {
  const app = Fastify({ logger: true });

  // The frontend is a separate origin (D14). Browsers refuse cross-origin
  // responses unless the server names that origin in a CORS header.
  app.register(cors, { origin: config.corsOrigin });
  app.register(healthRoutes);

  return app;
}
