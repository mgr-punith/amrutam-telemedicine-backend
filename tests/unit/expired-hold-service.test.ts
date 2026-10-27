import { describe, expect, it, vi } from 'vitest';

import type { ApplicationMetrics } from '../../src/infra/observability/metrics.js';
import type { ExpiredHoldRepository } from '../../src/worker/expired-hold-repository.js';
import { ExpiredHoldService } from '../../src/worker/expired-hold-service.js';

describe('ExpiredHoldService', () => {
  it('records compensated holds without exposing booking data', async () => {
    const repository = {
      expireDueHolds: vi.fn<ExpiredHoldRepository['expireDueHolds']>().mockResolvedValue(3),
    };
    const recordExpiredHolds = vi.fn<(count: number) => void>();
    const metrics = { recordExpiredHolds } as unknown as ApplicationMetrics;
    const service = new ExpiredHoldService(repository, metrics);
    const now = new Date('2031-01-01T10:00:00.000Z');

    await expect(service.scan(now)).resolves.toBe(3);
    expect(repository.expireDueHolds).toHaveBeenCalledTimes(1);
    const call = repository.expireDueHolds.mock.calls[0]?.[0];
    expect(call?.now).toEqual(now);
    expect(call?.requestId).toMatch(/^worker_/u);
    expect(recordExpiredHolds).toHaveBeenCalledWith(3);
  });
});
