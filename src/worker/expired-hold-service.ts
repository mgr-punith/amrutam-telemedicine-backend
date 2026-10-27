import { randomUUID } from 'node:crypto';

import type { ApplicationMetrics } from '../infra/observability/metrics.js';
import { withActiveSpan } from '../infra/observability/tracing.js';
import type { ExpiredHoldRepository } from './expired-hold-repository.js';

export class ExpiredHoldService {
  public constructor(
    private readonly repository: ExpiredHoldRepository,
    private readonly metrics: ApplicationMetrics,
  ) {}

  public async scan(now = new Date()): Promise<number> {
    const expiredCount = await withActiveSpan('worker.expire_held_slots', {}, () =>
      this.repository.expireDueHolds({
        now,
        requestId: `worker_${randomUUID()}`,
      }),
    );
    this.metrics.recordExpiredHolds(expiredCount);
    return expiredCount;
  }
}
