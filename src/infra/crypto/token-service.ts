import {
  createHash,
  createPrivateKey,
  createPublicKey,
  randomBytes,
  sign,
  timingSafeEqual,
  verify,
} from 'node:crypto';

interface JwtHeader {
  readonly alg: 'RS256';
  readonly kid: string;
  readonly typ: 'JWT';
}

export interface AccessTokenClaims {
  readonly sub: string;
  readonly role: 'PATIENT' | 'DOCTOR' | 'ADMIN';
  readonly scope: 'access' | 'mfa';
  readonly iss: string;
  readonly aud: string;
  readonly iat: number;
  readonly exp: number;
  readonly jti: string;
}

export interface TokenServiceOptions {
  readonly privateKeyPem: string;
  readonly publicKeyPem: string;
  readonly keyId: string;
  readonly issuer: string;
  readonly audience: string;
  readonly accessTokenTtlSeconds: number;
}

export class TokenService {
  private readonly privateKey;
  private readonly publicKey;

  public constructor(private readonly options: TokenServiceOptions) {
    this.privateKey = createPrivateKey(options.privateKeyPem);
    this.publicKey = createPublicKey(options.publicKeyPem);
  }

  public issueAccessToken(
    subject: string,
    role: AccessTokenClaims['role'],
    scope: AccessTokenClaims['scope'] = 'access',
    now = new Date(),
  ): string {
    const issuedAt = Math.floor(now.getTime() / 1_000);
    const claims: AccessTokenClaims = {
      sub: subject,
      role,
      scope,
      iss: this.options.issuer,
      aud: this.options.audience,
      iat: issuedAt,
      exp: issuedAt + this.options.accessTokenTtlSeconds,
      jti: randomBytes(16).toString('hex'),
    };
    const header: JwtHeader = { alg: 'RS256', kid: this.options.keyId, typ: 'JWT' };
    const unsigned = `${encodeJson(header)}.${encodeJson(claims)}`;
    const signature = sign('RSA-SHA256', Buffer.from(unsigned), this.privateKey);
    return `${unsigned}.${signature.toString('base64url')}`;
  }

  public verifyAccessToken(token: string, now = new Date()): AccessTokenClaims {
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new Error('Token has an invalid format.');
    }
    const [headerEncoded, payloadEncoded, signatureEncoded] = parts;
    if (
      headerEncoded === undefined ||
      payloadEncoded === undefined ||
      signatureEncoded === undefined
    ) {
      throw new Error('Token has an invalid format.');
    }

    const header = parseJwtHeader(headerEncoded);
    if (header.kid !== this.options.keyId) {
      throw new Error('Token uses an unsupported signing key or algorithm.');
    }

    const unsigned = `${headerEncoded}.${payloadEncoded}`;
    const isValidSignature = verify(
      'RSA-SHA256',
      Buffer.from(unsigned),
      this.publicKey,
      decodeBase64Url(signatureEncoded),
    );
    if (!isValidSignature) {
      throw new Error('Token signature is invalid.');
    }

    const claims = parseClaims(payloadEncoded);
    const nowSeconds = Math.floor(now.getTime() / 1_000);
    if (
      claims.iss !== this.options.issuer ||
      claims.aud !== this.options.audience ||
      claims.iat > nowSeconds ||
      claims.exp <= claims.iat ||
      claims.exp <= nowSeconds
    ) {
      throw new Error('Token claims are invalid or expired.');
    }
    return claims;
  }
}

export function createOpaqueToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashOpaqueToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function opaqueTokenMatches(token: string, expectedHash: string): boolean {
  if (!/^[a-f\d]{64}$/u.test(expectedHash)) {
    return false;
  }

  const actual = Buffer.from(hashOpaqueToken(token), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function encodeJson(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function parseJson(encoded: string): unknown {
  return JSON.parse(decodeBase64Url(encoded).toString('utf8')) as unknown;
}

function decodeBase64Url(encoded: string): Buffer {
  if (encoded.length === 0 || !/^[A-Za-z\d_-]+$/u.test(encoded)) {
    throw new Error('Token contains invalid base64url data.');
  }

  const decoded = Buffer.from(encoded, 'base64url');
  if (decoded.toString('base64url') !== encoded) {
    throw new Error('Token contains non-canonical base64url data.');
  }
  return decoded;
}

function parseJwtHeader(encoded: string): JwtHeader {
  const value = parseJson(encoded);
  if (
    typeof value !== 'object' ||
    value === null ||
    !('alg' in value) ||
    value.alg !== 'RS256' ||
    !('typ' in value) ||
    value.typ !== 'JWT' ||
    !('kid' in value) ||
    typeof value.kid !== 'string'
  ) {
    throw new Error('Token header is invalid.');
  }
  return { alg: value.alg, typ: value.typ, kid: value.kid };
}

function parseClaims(encoded: string): AccessTokenClaims {
  const value = parseJson(encoded);
  if (typeof value !== 'object' || value === null) {
    throw new Error('Token claims are invalid.');
  }

  if (
    !('sub' in value) ||
    typeof value.sub !== 'string' ||
    value.sub.length === 0 ||
    !('role' in value) ||
    typeof value.role !== 'string' ||
    !('scope' in value) ||
    typeof value.scope !== 'string' ||
    !('iss' in value) ||
    typeof value.iss !== 'string' ||
    !('aud' in value) ||
    typeof value.aud !== 'string' ||
    !('jti' in value) ||
    typeof value.jti !== 'string' ||
    value.jti.length === 0 ||
    !('iat' in value) ||
    typeof value.iat !== 'number' ||
    !('exp' in value) ||
    typeof value.exp !== 'number' ||
    !['PATIENT', 'DOCTOR', 'ADMIN'].includes(value.role) ||
    !['access', 'mfa'].includes(value.scope)
  ) {
    throw new Error('Token claims are invalid.');
  }

  return {
    sub: value.sub,
    role: value.role as AccessTokenClaims['role'],
    scope: value.scope as AccessTokenClaims['scope'],
    iss: value.iss,
    aud: value.aud,
    iat: value.iat,
    exp: value.exp,
    jti: value.jti,
  };
}
