import { describe, expect, it } from 'vitest';

import type { PaymentRepository } from '../../src/modules/payments/payment-repository.js';
import { PaymentService, signPaymentWebhook } from '../../src/modules/payments/payment-service.js';

const webhookSecret = 'test-webhook-secret-at-least-32-characters';

describe('PaymentService', () => {
  it('rejects forged webhook signatures before repository access', async () => {
    let called = false;
    const repository: PaymentRepository = {
      processEvent: () => {
        called = true;
        return Promise.resolve({ kind: 'payment_not_found' });
      },
      findProviderReference: () => Promise.resolve(null),
    };
    const service = new PaymentService(repository, webhookSecret);
    const rawBody = Buffer.from(
      JSON.stringify({
        eventId: 'event-12345678',
        providerReference: 'mock-reference',
        status: 'SUCCEEDED',
      }),
    );

    await expect(
      service.processWebhook({
        event: {
          eventId: 'event-12345678',
          providerReference: 'mock-reference',
          status: 'SUCCEEDED',
        },
        rawBody,
        signature: '0'.repeat(64),
        requestId: 'request-id',
      }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(called).toBe(false);
    expect(signPaymentWebhook(rawBody, webhookSecret)).toHaveLength(64);
  });
});
