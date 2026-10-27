import type { RequestHandler } from 'express';

import { ForbiddenError, UnauthorizedError } from '../common/errors/app-error.js';
import type { UserRole } from '../modules/auth/auth-types.js';

export function requireRoles(...roles: readonly UserRole[]): RequestHandler {
  return (request, _response, next) => {
    if (request.auth === undefined) {
      next(new UnauthorizedError());
      return;
    }
    if (!roles.includes(request.auth.role)) {
      next(new ForbiddenError());
      return;
    }
    next();
  };
}

export interface ResourceOwnership {
  readonly patientUserId?: string;
  readonly doctorUserId?: string;
}

export function assertResourceAccess(
  principal: Express.Request['auth'],
  ownership: ResourceOwnership,
): void {
  if (principal === undefined) {
    throw new UnauthorizedError();
  }
  if (principal.role === 'PATIENT' && ownership.patientUserId === principal.userId) {
    return;
  }
  if (principal.role === 'DOCTOR' && ownership.doctorUserId === principal.userId) {
    return;
  }
  throw new ForbiddenError();
}
