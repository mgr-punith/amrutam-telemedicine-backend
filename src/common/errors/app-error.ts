export class AppError extends Error {
  public constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: Readonly<Record<string, unknown>>,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class NotFoundError extends AppError {
  public constructor(message = 'The requested resource was not found.') {
    super(404, 'NOT_FOUND', message);
    this.name = 'NotFoundError';
  }
}

export class InvalidJsonError extends AppError {
  public constructor() {
    super(400, 'INVALID_JSON', 'The request body must contain valid JSON.');
    this.name = 'InvalidJsonError';
  }
}

export class PayloadTooLargeError extends AppError {
  public constructor() {
    super(413, 'PAYLOAD_TOO_LARGE', 'The request body exceeds the 100 KB limit.');
    this.name = 'PayloadTooLargeError';
  }
}

export class ValidationError extends AppError {
  public constructor(details?: Readonly<Record<string, unknown>>) {
    super(400, 'VALIDATION_ERROR', 'The request contains invalid data.', details);
    this.name = 'ValidationError';
  }
}

export class UnauthorizedError extends AppError {
  public constructor(message = 'Authentication is required or the credentials are invalid.') {
    super(401, 'UNAUTHORIZED', message);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends AppError {
  public constructor(message = 'You are not allowed to perform this action.') {
    super(403, 'FORBIDDEN', message);
    this.name = 'ForbiddenError';
  }
}

export class ConflictError extends AppError {
  public constructor(code: string, message: string) {
    super(409, code, message);
    this.name = 'ConflictError';
  }
}

export class TooManyRequestsError extends AppError {
  public constructor(retryAfterSeconds: number) {
    super(429, 'RATE_LIMITED', 'Too many requests. Try again later.', { retryAfterSeconds });
    this.name = 'TooManyRequestsError';
  }
}
