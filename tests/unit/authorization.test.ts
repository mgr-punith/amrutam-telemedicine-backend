import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';

import { assertResourceAccess, requireRoles } from '../../src/middleware/authorize.js';

describe('authorization helpers', () => {
  it('allows the expected role and rejects other roles', () => {
    const middleware = requireRoles('ADMIN');
    const allowedNext = vi.fn();
    middleware(
      { auth: { userId: 'admin-1', role: 'ADMIN', scope: 'access', tokenId: 'token' } } as Request,
      {} as Response,
      allowedNext as NextFunction,
    );
    expect(allowedNext).toHaveBeenCalledWith();

    const deniedNext = vi.fn();
    middleware(
      {
        auth: { userId: 'patient-1', role: 'PATIENT', scope: 'access', tokenId: 'token' },
      } as Request,
      {} as Response,
      deniedNext as NextFunction,
    );
    expect(deniedNext.mock.calls[0]?.[0]).toMatchObject({ code: 'FORBIDDEN' });
  });

  it('enforces patient and doctor ownership and denies admins prescription-style access', () => {
    expect(() => {
      assertResourceAccess(
        { userId: 'patient-1', role: 'PATIENT', scope: 'access', tokenId: 'token' },
        { patientUserId: 'patient-1', doctorUserId: 'doctor-1' },
      );
    }).not.toThrow();
    expect(() => {
      assertResourceAccess(
        { userId: 'doctor-1', role: 'DOCTOR', scope: 'access', tokenId: 'token' },
        { patientUserId: 'patient-1', doctorUserId: 'doctor-1' },
      );
    }).not.toThrow();
    expect(() => {
      assertResourceAccess(
        { userId: 'admin-1', role: 'ADMIN', scope: 'access', tokenId: 'token' },
        { patientUserId: 'patient-1', doctorUserId: 'doctor-1' },
      );
    }).toThrow('not allowed');
  });
});
