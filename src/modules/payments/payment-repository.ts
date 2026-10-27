import type { PaymentWebhookRequest } from './payment-contracts.js';

export type PaymentEventResult =
  | { readonly kind: 'processed'; readonly paymentId: string; readonly paymentStatus: string }
  | { readonly kind: 'duplicate'; readonly paymentId: string | null }
  | { readonly kind: 'event_mismatch' }
  | { readonly kind: 'payment_not_found' };

export interface PaymentRepository {
  processEvent(input: {
    readonly event: PaymentWebhookRequest;
    readonly payloadHash: string;
    readonly requestId: string;
    readonly now: Date;
  }): Promise<PaymentEventResult>;
  findProviderReference(paymentId: string): Promise<string | null>;
}
