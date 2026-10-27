import type { ConsultationStatus, PrismaClient } from '@prisma/client';

import type { AnalyticsRepository } from './analytics-repository.js';
import type { AdminAnalyticsOverview, CurrencyAmount } from './analytics-types.js';

export class PrismaAnalyticsRepository implements AnalyticsRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public getOverview(
    input: Parameters<AnalyticsRepository['getOverview']>[0],
  ): ReturnType<AnalyticsRepository['getOverview']> {
    return this.prisma.$transaction(async (transaction) => {
      const [usersByRole, doctorProfiles, verifiedDoctorProfiles, consultationsByStatus, payments] =
        await Promise.all([
          transaction.user.groupBy({ by: ['role'], _count: { _all: true } }),
          transaction.doctor.count(),
          transaction.doctor.count({ where: { verificationStatus: 'VERIFIED' } }),
          transaction.consultation.groupBy({ by: ['status'], _count: { _all: true } }),
          transaction.payment.groupBy({
            by: ['status', 'currency'],
            where: { status: { in: ['SUCCEEDED', 'REFUNDED'] } },
            _count: { _all: true },
            _sum: { amountMinor: true },
          }),
        ]);

      const userCounts = { PATIENT: 0, DOCTOR: 0, ADMIN: 0 };
      for (const group of usersByRole) {
        userCounts[group.role] = group._count._all;
      }
      const consultationCounts: Record<ConsultationStatus, number> = {
        PENDING_PAYMENT: 0,
        CONFIRMED: 0,
        IN_PROGRESS: 0,
        COMPLETED: 0,
        CANCELLED: 0,
        EXPIRED: 0,
        NO_SHOW: 0,
      };
      for (const group of consultationsByStatus) {
        switch (group.status) {
          case 'PENDING_PAYMENT':
            consultationCounts.PENDING_PAYMENT = group._count._all;
            break;
          case 'CONFIRMED':
            consultationCounts.CONFIRMED = group._count._all;
            break;
          case 'IN_PROGRESS':
            consultationCounts.IN_PROGRESS = group._count._all;
            break;
          case 'COMPLETED':
            consultationCounts.COMPLETED = group._count._all;
            break;
          case 'CANCELLED':
            consultationCounts.CANCELLED = group._count._all;
            break;
          case 'EXPIRED':
            consultationCounts.EXPIRED = group._count._all;
            break;
          case 'NO_SHOW':
            consultationCounts.NO_SHOW = group._count._all;
            break;
        }
      }

      const succeeded = payments.filter(({ status }) => status === 'SUCCEEDED');
      const refunded = payments.filter(({ status }) => status === 'REFUNDED');
      const overview: AdminAnalyticsOverview = {
        generatedAt: input.now.toISOString(),
        users: {
          total: Object.values(userCounts).reduce((total, count) => total + count, 0),
          patients: userCounts.PATIENT,
          doctors: userCounts.DOCTOR,
          admins: userCounts.ADMIN,
        },
        doctorProfiles: { total: doctorProfiles, verified: verifiedDoctorProfiles },
        consultations: {
          total: Object.values(consultationCounts).reduce((total, count) => total + count, 0),
          byStatus: consultationCounts,
        },
        payments: {
          succeeded: succeeded.reduce((total, group) => total + group._count._all, 0),
          refunded: refunded.reduce((total, group) => total + group._count._all, 0),
          capturedAmountMinorByCurrency: toCurrencyAmounts(succeeded),
          refundedAmountMinorByCurrency: toCurrencyAmounts(refunded),
        },
        prescriptions: { total: await transaction.prescription.count() },
      };

      await transaction.auditLog.create({
        data: {
          actorId: input.actorId,
          actorRole: 'ADMIN',
          action: 'admin.analytics.viewed',
          resourceType: 'analytics',
          resourceId: null,
          requestId: input.requestId,
        },
      });
      return overview;
    });
  }
}

function toCurrencyAmounts(
  groups: readonly {
    readonly currency: string;
    readonly _sum: { readonly amountMinor: number | null };
  }[],
): readonly CurrencyAmount[] {
  return groups
    .map((group) => ({
      currency: group.currency,
      amountMinor: group._sum.amountMinor ?? 0,
    }))
    .sort((left, right) => left.currency.localeCompare(right.currency));
}
