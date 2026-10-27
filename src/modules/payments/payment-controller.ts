import type { RequestHandler } from 'express';

import {
  paymentIdParamsSchema,
  paymentWebhookRequestSchema,
  simulatePaymentRequestSchema,
} from './payment-contracts.js';
import type { PaymentService } from './payment-service.js';

export class PaymentController {
  public constructor(private readonly service: PaymentService) {}

  public readonly webhook: RequestHandler = async (request, response) => {
    const result = await this.service.processWebhook({
      event: paymentWebhookRequestSchema.parse(request.body),
      rawBody: request.rawBody ?? Buffer.alloc(0),
      signature: request.header('x-payment-signature'),
      requestId: request.requestId,
    });
    response.status(200).json(result);
  };

  public readonly simulate: RequestHandler = async (request, response) => {
    const { id } = paymentIdParamsSchema.parse(request.params);
    const result = await this.service.simulate(
      id,
      simulatePaymentRequestSchema.parse(request.body),
      request.requestId,
    );
    response.status(200).json(result);
  };
}
