import { PrismaClient } from '@prisma/client';
import { Queue, Worker } from 'bullmq';

import { loadEnvironment } from './config/environment.js';
import { createLogger } from './infra/logger.js';
import { ApplicationMetrics, startMetricsServer } from './infra/observability/metrics.js';
import { stopTelemetry } from './infra/observability/tracing.js';
import { ExpiredHoldService } from './worker/expired-hold-service.js';
import { PrismaExpiredHoldRepository } from './worker/prisma-expired-hold-repository.js';

const QUEUE_NAME = 'amrutam-maintenance';
const JOB_NAME = 'expire-held-slots';
const environment = loadEnvironment();

const logger = createLogger(environment);
const prisma = new PrismaClient();
const metrics = new ApplicationMetrics(environment.serviceName);
const connection = { url: environment.redisUrl, maxRetriesPerRequest: null } as const;
const queue = new Queue<object, number, typeof JOB_NAME>(QUEUE_NAME, {
  connection,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: 'exponential', delay: 1_000 },
    removeOnComplete: { age: 3_600, count: 100 },
    removeOnFail: { age: 86_400, count: 1_000 },
  },
});
const service = new ExpiredHoldService(new PrismaExpiredHoldRepository(prisma), metrics);
const worker = new Worker<object, number, typeof JOB_NAME>(QUEUE_NAME, async () => service.scan(), {
  connection,
  concurrency: 1,
});
const metricsServer = startMetricsServer({
  metrics,
  port: environment.metricsPort,
  logger,
});

await queue.upsertJobScheduler(
  JOB_NAME,
  { every: environment.workerScanIntervalMs },
  { name: JOB_NAME, data: {} },
);

worker.on('completed', (job, expiredCount) => {
  logger.info({ jobId: job.id, expiredCount }, 'Expired hold scan completed');
});
worker.on('failed', (job, error) => {
  logger.error({ jobId: job?.id, err: error }, 'Expired hold scan failed');
});
logger.info({ queue: QUEUE_NAME }, 'Maintenance worker started');

function shutdown(signal: NodeJS.Signals): void {
  logger.info({ signal }, 'Worker shutdown started');
  metricsServer.close();
  void Promise.all([worker.close(), queue.close(), prisma.$disconnect(), stopTelemetry()])
    .catch((error: unknown) => {
      logger.error({ err: error }, 'Worker shutdown failed');
      process.exitCode = 1;
    })
    .finally(() => {
      process.exit();
    });
}

process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
