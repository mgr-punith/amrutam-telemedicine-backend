import type { Server } from 'node:http';

import { createContainer } from './container.js';
import { startMetricsServer } from './infra/observability/metrics.js';
import { stopTelemetry } from './infra/observability/tracing.js';

const { app, environment, logger, metrics, prisma } = createContainer();

const server: Server = app.listen(environment.port, () => {
  logger.info({ port: environment.port }, 'HTTP server started');
});
const metricsServer = startMetricsServer({ metrics, port: environment.metricsPort, logger });

function shutdown(signal: NodeJS.Signals): void {
  logger.info({ signal }, 'Graceful shutdown started');
  const forceShutdown = setTimeout(() => {
    logger.error('HTTP server did not drain before the shutdown deadline');
    process.exitCode = 1;
    server.closeAllConnections();
  }, 10_000);
  forceShutdown.unref();

  server.close((error) => {
    clearTimeout(forceShutdown);
    if (error !== undefined) {
      logger.error({ err: error }, 'HTTP server shutdown failed');
      process.exitCode = 1;
    }
    void Promise.all([prisma.$disconnect(), stopTelemetry()]).catch((shutdownError: unknown) => {
      logger.error({ err: shutdownError }, 'Dependency shutdown failed');
      process.exitCode = 1;
    });
  });

  server.closeIdleConnections();
  metricsServer.close();
}

process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
