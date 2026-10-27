import { describe, expect, it } from 'vitest';

import { idempotencyInternals } from '../../src/middleware/idempotency.js';

describe('idempotency request hashing', () => {
  it('canonicalizes object keys while preserving array order', () => {
    expect(idempotencyInternals.canonicalize({ b: 2, a: { d: 4, c: 3 } })).toBe(
      '{"a":{"c":3,"d":4},"b":2}',
    );
    expect(idempotencyInternals.canonicalize([2, 1])).not.toBe(
      idempotencyInternals.canonicalize([1, 2]),
    );
  });

  it('binds a request hash to the user, method, path, and canonical body', () => {
    const first = idempotencyInternals.hashRequest({
      userId: 'patient-1',
      method: 'post',
      path: '/api/v1/consultations',
      body: { mode: 'VIDEO', slotId: 'slot-1' },
    });
    const reordered = idempotencyInternals.hashRequest({
      userId: 'patient-1',
      method: 'POST',
      path: '/api/v1/consultations',
      body: { slotId: 'slot-1', mode: 'VIDEO' },
    });
    const otherUser = idempotencyInternals.hashRequest({
      userId: 'patient-2',
      method: 'POST',
      path: '/api/v1/consultations',
      body: { slotId: 'slot-1', mode: 'VIDEO' },
    });

    expect(first).toBe(reordered);
    expect(first).not.toBe(otherUser);
  });
});
