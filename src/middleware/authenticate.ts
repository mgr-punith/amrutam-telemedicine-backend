import type { RequestHandler } from 'express';

import { UnauthorizedError } from '../common/errors/app-error.js';
import type { TokenService } from '../infra/crypto/token-service.js';
import type { TokenScope } from '../modules/auth/auth-types.js';

export interface AuthenticateOptions {
  readonly scopes?: readonly TokenScope[];
}

export function createAuthenticate(
  tokenService: Pick<TokenService, 'verifyAccessToken'>,
  options: AuthenticateOptions = {},
): RequestHandler {
  const allowedScopes = options.scopes ?? ['access'];

  return (request, _response, next) => {
    try {
      const authorization = request.header('authorization');
      if (authorization?.startsWith('Bearer ') !== true) {
        throw new UnauthorizedError();
      }
      const token = authorization.slice('Bearer '.length);
      const claims = tokenService.verifyAccessToken(token);
      if (!allowedScopes.includes(claims.scope)) {
        throw new UnauthorizedError('The token cannot be used for this operation.');
      }
      request.auth = {
        userId: claims.sub,
        role: claims.role,
        scope: claims.scope,
        tokenId: claims.jti,
      };
      next();
    } catch (error: unknown) {
      next(error instanceof UnauthorizedError ? error : new UnauthorizedError());
    }
  };
}
