import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

import { ConflictError, NotFoundError, UnauthorizedError } from '../../common/errors/app-error.js';
import type { PaymentWebhookRequest, SimulatePaymentRequest } from './payment-contracts.js';
import type { PaymentRepository } from './payment-repository.js';

export class PaymentService {
  public constructor(
    private readonly repository: PaymentRepository,
    private readonly webhookSecret: string,
  ) {}

  public async processWebhook(input: {
    readonly event: PaymentWebhookRequest;
    readonly rawBody: Buffer;
    readonly signature: string | undefined;
    readonly requestId: string;
    readonly now?: Date;
  }) {
    if (!verifySignature(input.rawBody, input.signature, this.webhookSecret)) {
      throw new UnauthorizedError('The payment webhook signature is invalid.');
    }
    return this.processVerifiedEvent(
      input.event,
      hashPaymentEvent(input.event),
      input.requestId,
      input.now ?? new Date(),
    );
  }

  public async simulate(
    paymentId: string,
    input: SimulatePaymentRequest,
    requestId: string,
    now = new Date(),
  ) {
    const providerReference = await this.repository.findProviderReference(paymentId);
    if (providerReference === null) {
      throw new NotFoundError('The payment was not found.');
    }
    const event: PaymentWebhookRequest = {
      eventId: `dev_${randomUUID()}`,
      providerReference,
      status: input.status,
    };
    const payloadHash = hashPaymentEvent(event);
    return this.processVerifiedEvent(event, payloadHash, requestId, now);
  }

  private async processVerifiedEvent(
    event: PaymentWebhookRequest,
    payloadHash: string,
    requestId: string,
    now: Date,
  ) {
    const result = await this.repository.processEvent({ event, payloadHash, requestId, now });
    if (result.kind === 'event_mismatch') {
      throw new ConflictError(
        'WEBHOOK_EVENT_REUSED',
        'The webhook event ID was reused with a different payload.',
      );
    }
    if (result.kind === 'payment_not_found') {
      throw new NotFoundError('The payment provider reference was not found.');
    }
    return {
      received: true,
      duplicate: result.kind === 'duplicate',
      paymentId: result.paymentId,
      ...(result.kind === 'processed' ? { paymentStatus: result.paymentStatus } : {}),
    };
  }
}

function verifySignature(rawBody: Buffer, signature: string | undefined, secret: string): boolean {
  if (signature === undefined || !/^[a-f\d]{64}$/u.test(signature)) {
    return false;
  }
  const expected = createHmac('sha256', secret).update(rawBody).digest();
  const provided = Buffer.from(signature, 'hex');
  return expected.length === provided.length && timingSafeEqual(expected, provided);
}

export function signPaymentWebhook(rawBody: Buffer, secret: string): string {
  return createHmac('sha256', secret).update(rawBody).digest('hex');
}

function hashPaymentEvent(event: PaymentWebhookRequest): string {
  return createHash('sha256').update(JSON.stringify(event)).digest('hex');
}
