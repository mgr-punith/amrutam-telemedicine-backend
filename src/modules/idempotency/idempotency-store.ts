export type IdempotencyClaimResult =
  | { readonly kind: 'claimed' }
  | { readonly kind: 'in_progress' }
  | { readonly kind: 'mismatch' }
  | {
      readonly kind: 'replay';
      readonly responseStatus: number;
      readonly responseBody: unknown;
    };

export interface IdempotencyStore {
  claim(input: {
    readonly userId: string;
    readonly key: string;
    readonly method: string;
    readonly path: string;
    readonly requestHash: string;
    readonly now: Date;
    readonly expiresAt: Date;
  }): Promise<IdempotencyClaimResult>;
  complete(input: {
    readonly userId: string;
    readonly key: string;
    readonly requestHash: string;
    readonly responseStatus: number;
    readonly responseBody: unknown;
  }): Promise<void>;
  abandon(input: {
    readonly userId: string;
    readonly key: string;
    readonly requestHash: string;
  }): Promise<void>;
}
