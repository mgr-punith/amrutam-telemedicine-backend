import { createConnection } from 'node:net';

import { createApp } from './app.js';
import { loadEnvironment } from './config/environment.js';
import { createLogger } from './infra/logger.js';
import { HealthController } from './modules/health/health-controller.js';
import { HealthService, type ReadinessCheck } from './modules/health/health-service.js';

const DEPENDENCY_CHECK_TIMEOUT_MS = 2_000;

function createTcpReadinessCheck(name: string, urlValue: string): ReadinessCheck {
  const url = new URL(urlValue);
  const defaultPort = url.protocol === 'postgresql:' ? 5432 : 6379;
  const port = url.port === '' ? defaultPort : Number(url.port);

  return {
    name,
    async check(): Promise<void> {
      await new Promise<void>((resolve, reject) => {
        const socket = createConnection({ host: url.hostname, port });
        const onError = (error: Error): void => {
          socket.destroy();
          reject(error);
        };

        socket.setTimeout(DEPENDENCY_CHECK_TIMEOUT_MS);
        socket.once('connect', () => {
          socket.destroy();
          resolve();
        });
        socket.once('timeout', () => {
          onError(new Error(`${name} readiness check timed out`));
        });
        socket.once('error', onError);
      });
    },
  };
}

export interface ContainerOverrides {
  readonly readinessChecks?: readonly ReadinessCheck[];
}

export function createContainer(overrides: ContainerOverrides = {}) {
  const environment = loadEnvironment();
  const logger = createLogger(environment);
  // M0 proves dependency reachability without coupling the health route to a future ORM or Redis client.
  const readinessChecks = overrides.readinessChecks ?? [
    createTcpReadinessCheck('postgres', environment.databaseUrl),
    createTcpReadinessCheck('redis', environment.redisUrl),
  ];
  const healthService = new HealthService(readinessChecks);
  const healthController = new HealthController(healthService);
  const app = createApp({ environment, logger, healthController });

  return { app, environment, logger } as const;
}
