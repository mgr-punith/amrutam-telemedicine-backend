import { describe, expect, it, vi } from 'vitest';

import type { AuthenticatedPrincipal } from '../../src/modules/auth/auth-types.js';
import type { AnalyticsRepository } from '../../src/modules/admin/analytics-repository.js';
import { AnalyticsService } from '../../src/modules/admin/analytics-service.js';

const admin: AuthenticatedPrincipal = {
  userId: '10000000-0000-4000-8000-000000000003',
  role: 'ADMIN',
  scope: 'access',
  tokenId: 'admin-token',
};

describe('AnalyticsService', () => {
  it('allows administrators and denies patient access', async () => {
    const repository = {
      getOverview: vi.fn<AnalyticsRepository['getOverview']>().mockResolvedValue({
        generatedAt: '2031-01-01T00:00:00.000Z',
        users: { total: 3, patients: 1, doctors: 1, admins: 1 },
        doctorProfiles: { total: 1, verified: 1 },
        consultations: {
          total: 0,
          byStatus: {
            PENDING_PAYMENT: 0,
            CONFIRMED: 0,
            IN_PROGRESS: 0,
            COMPLETED: 0,
            CANCELLED: 0,
            EXPIRED: 0,
            NO_SHOW: 0,
          },
        },
        payments: {
          succeeded: 0,
          refunded: 0,
          capturedAmountMinorByCurrency: [],
          refundedAmountMinorByCurrency: [],
        },
        prescriptions: { total: 0 },
      }),
    };
    const service = new AnalyticsService(repository);

    await expect(service.getOverview(admin, 'request-1')).resolves.toMatchObject({
      users: { total: 3 },
    });
    await expect(
      service.getOverview({ ...admin, role: 'PATIENT' }, 'request-2'),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(repository.getOverview).toHaveBeenCalledTimes(1);
  });
});
