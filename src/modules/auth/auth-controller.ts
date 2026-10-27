import type { RequestHandler } from 'express';

import { UnauthorizedError } from '../../common/errors/app-error.js';
import {
  loginRequestSchema,
  mfaCodeRequestSchema,
  mfaVerifyRequestSchema,
  refreshTokenRequestSchema,
  registerRequestSchema,
} from './auth-contracts.js';
import type { AuthService } from './auth-service.js';

export class AuthController {
  public constructor(private readonly authService: AuthService) {}

  public readonly register: RequestHandler = async (request, response) => {
    const result = await this.authService.register(registerRequestSchema.parse(request.body), {
      requestId: request.requestId,
    });
    response.status(201).json(result);
  };

  public readonly login: RequestHandler = async (request, response) => {
    const result = await this.authService.login(loginRequestSchema.parse(request.body), {
      requestId: request.requestId,
    });
    response.status(200).json(result);
  };

  public readonly enrollMfa: RequestHandler = async (request, response) => {
    const result = await this.authService.enrollMfa(requirePrincipal(request), {
      requestId: request.requestId,
    });
    response.status(200).json(result);
  };

  public readonly activateMfa: RequestHandler = async (request, response) => {
    const result = await this.authService.activateMfa(
      requirePrincipal(request),
      mfaCodeRequestSchema.parse(request.body),
      { requestId: request.requestId },
    );
    response.status(200).json(result);
  };

  public readonly verifyMfa: RequestHandler = async (request, response) => {
    const result = await this.authService.verifyMfa(
      requirePrincipal(request),
      mfaVerifyRequestSchema.parse(request.body),
      { requestId: request.requestId },
    );
    response.status(200).json(result);
  };

  public readonly refresh: RequestHandler = async (request, response) => {
    const result = await this.authService.refresh(refreshTokenRequestSchema.parse(request.body), {
      requestId: request.requestId,
    });
    response.status(200).json(result);
  };

  public readonly logout: RequestHandler = async (request, response) => {
    await this.authService.logout(
      requirePrincipal(request),
      refreshTokenRequestSchema.parse(request.body),
      { requestId: request.requestId },
    );
    response.status(204).send();
  };
}

function requirePrincipal(request: Express.Request) {
  if (request.auth === undefined) {
    throw new UnauthorizedError();
  }
  return request.auth;
}
