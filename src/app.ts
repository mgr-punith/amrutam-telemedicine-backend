import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import type { Logger } from 'pino';

import type { Environment } from './config/environment.js';
import { createErrorHandler, notFoundHandler } from './middleware/error-handler.js';
import { createHttpLogger } from './middleware/http-logger.js';
import { requestIdMiddleware } from './middleware/request-id.js';
import type { HealthController } from './modules/health/health-controller.js';
import { createHealthRouter } from './modules/health/health-routes.js';

export interface AppDependencies {
  readonly environment: Pick<Environment, 'corsAllowedOrigins'>;
  readonly logger: Logger;
  readonly healthController: HealthController;
}

export function createApp(dependencies: AppDependencies): Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(requestIdMiddleware);
  app.use(createHttpLogger(dependencies.logger));
  app.use(helmet());
  app.use(
    cors({
      origin: [...dependencies.environment.corsAllowedOrigins],
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '100kb', strict: true }));

  app.use('/health', createHealthRouter(dependencies.healthController));

  app.use(notFoundHandler());
  app.use(createErrorHandler(dependencies.logger));

  return app;
}
