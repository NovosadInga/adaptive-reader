/**
 * Entrypoint: configuration → application → listen.
 *
 *   npm run dev     — with --watch and .env (if present)
 *   npm start       — plain
 */
import { buildApp } from './app.ts';
import { ConfigError, loadConfig } from './config.ts';

let config;
try {
  config = loadConfig(process.env);
} catch (error) {
  if (error instanceof ConfigError) {
    console.error(`Cannot start: ${error.message}`);
    process.exit(1);
  }
  throw error;
}

const app = buildApp(config);
await app.listen({ port: config.port, host: config.host });
