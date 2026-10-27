import express from 'express';
import pino from 'pino';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createHttpLogger } from '../../src/middleware/http-logger.js';
import { createErrorHandler } from '../../src/middleware/error-handler.js';
import { requestIdMiddleware } from '../../src/middleware/request-id.js';

describe('HTTP completion logs', () => {
  it.each([200, 500])(
    'logs timing and safe fields for status %i without raw requests',
    async (status) => {
      const lines: string[] = [];
      const logger = pino(
        { level: 'info' },
        {
          write: (line: string) => {
            lines.push(line);
          },
        },
      );
      const app = express();
      app.use(requestIdMiddleware);
      app.use(createHttpLogger(logger));
      const router = express.Router();
      router.get('/doctors/:id', (_request, response, next) => {
        if (status === 500) {
          next(new Error('sensitive-prescription-from-database'));
          return;
        }
        response.status(status).end();
      });
      app.use('/api/v1', router);
      app.use(createErrorHandler(logger));

      await request(app)
        .get('/api/v1/doctors/20000000-0000-4000-8000-000000000002?phone=sensitive-query')
        .set('Authorization', 'Bearer sensitive-token')
        .set('Cookie', 'private=sensitive-cookie')
        .expect(status);

      const output = lines.join('');
      expect(output).not.toContain('sensitive-');
      expect(output).not.toContain('20000000-0000-4000-8000-000000000002');
      const record: unknown = JSON.parse(lines.at(-1) ?? '{}');
      expect(record).toMatchObject({
        requestId: expect.any(String) as unknown,
        method: 'GET',
        route: '/api/v1/doctors/:id',
        statusCode: status,
        durationMs: expect.any(Number) as unknown,
      });
    },
  );
});
