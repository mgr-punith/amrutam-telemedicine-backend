import type { ConsultationStatus } from '../consultations/consultation-types.js';

export interface AdminAnalyticsOverview {
  readonly generatedAt: string;
  readonly users: {
    readonly total: number;
    readonly patients: number;
    readonly doctors: number;
    readonly admins: number;
  };
  readonly doctorProfiles: {
    readonly total: number;
    readonly verified: number;
  };
  readonly consultations: {
    readonly total: number;
    readonly byStatus: Readonly<Record<ConsultationStatus, number>>;
  };
  readonly payments: {
    readonly succeeded: number;
    readonly refunded: number;
    readonly capturedAmountMinorByCurrency: readonly CurrencyAmount[];
    readonly refundedAmountMinorByCurrency: readonly CurrencyAmount[];
  };
  readonly prescriptions: {
    readonly total: number;
  };
}

export interface CurrencyAmount {
  readonly currency: string;
  readonly amountMinor: number;
}
