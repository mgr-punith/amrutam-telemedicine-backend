import type { Server } from 'node:http';

import { createContainer } from './container.js';

const { app, environment, logger, prisma } = createContainer();

const server: Server = app.listen(environment.port, () => {
  logger.info({ port: environment.port }, 'HTTP server started');
});

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
    void prisma.$disconnect().catch((disconnectError: unknown) => {
      logger.error({ err: disconnectError }, 'Prisma shutdown failed');
      process.exitCode = 1;
    });
  });

  server.closeIdleConnections();
}

process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
