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
