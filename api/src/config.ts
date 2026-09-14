/**
 * Server configuration, read once from environment variables at startup.
 *
 * Nothing is hard-coded: the port, the bind address and the frontend origin
 * differ between a laptop and a hosted process, and later the Anthropic key
 * arrives the same way (D8: secrets only through the environment). A missing
 * required variable stops the process with the variable's name rather than
 * failing somewhere later with a less obvious message.
 */

export interface Config {
  /** TCP port to listen on. `PORT`, default 3000. */
  readonly port: number;
  /**
   * Address to bind. `HOST`, default 127.0.0.1 — loopback only, so a dev
   * server is not reachable from the network by accident. A hosting platform
   * sets 0.0.0.0 explicitly.
   */
  readonly host: string;
  /**
   * Origin the browser frontend is served from, e.g. `http://localhost:5173`.
   * `CORS_ORIGIN`, required: a default would silently be wrong in production.
   */
  readonly corsOrigin: string;
}

/** A configuration problem a person can fix by setting a variable. */
export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

export function loadConfig(env: NodeJS.ProcessEnv): Config {
  return {
    port: readPort(env, 'PORT', 3000),
    host: readOptional(env, 'HOST', '127.0.0.1'),
    corsOrigin: readRequired(env, 'CORS_ORIGIN'),
  };
}

function readRequired(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) {
    throw new ConfigError(`Missing required environment variable ${name}`);
  }
  return value;
}

function readOptional(env: NodeJS.ProcessEnv, name: string, fallback: string): string {
  const value = env[name]?.trim();
  return value ? value : fallback;
}

function readPort(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const raw = env[name]?.trim();
  if (!raw) {
    return fallback;
  }
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new ConfigError(`${name} must be an integer between 1 and 65535, got "${raw}"`);
  }
  return port;
}
