import type { ErrorRequestHandler, RequestHandler } from 'express';
import type { Logger } from 'pino';

import {
  AppError,
  InvalidJsonError,
  NotFoundError,
  PayloadTooLargeError,
} from '../common/errors/app-error.js';

function hasErrorType(error: unknown, type: string): boolean {
  return typeof error === 'object' && error !== null && 'type' in error && error.type === type;
}

export function notFoundHandler(): RequestHandler {
  return (_request, _response, next) => {
    next(new NotFoundError());
  };
}

export function createErrorHandler(logger: Logger): ErrorRequestHandler {
  return (error: unknown, request, response, _next): void => {
    const publicError = hasErrorType(error, 'entity.too.large')
      ? new PayloadTooLargeError()
      : hasErrorType(error, 'entity.parse.failed')
        ? new InvalidJsonError()
        : error;

    if (publicError instanceof AppError) {
      response.status(publicError.statusCode).json({
        error: {
          code: publicError.code,
          message: publicError.message,
          requestId: request.requestId,
          ...(publicError.details === undefined ? {} : { details: publicError.details }),
        },
      });
      return;
    }

    logger.error({ err: error, requestId: request.requestId }, 'Unhandled request error');
    response.status(500).json({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred.',
        requestId: request.requestId,
      },
    });
  };
}
