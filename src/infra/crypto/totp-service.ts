import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export interface TotpOptions {
  readonly issuer: string;
  readonly periodSeconds?: number;
  readonly digits?: number;
  readonly allowedWindow?: number;
}

export class TotpService {
  private readonly periodSeconds: number;
  private readonly digits: number;
  private readonly allowedWindow: number;

  public constructor(private readonly options: TotpOptions) {
    this.periodSeconds = options.periodSeconds ?? 30;
    this.digits = options.digits ?? 6;
    this.allowedWindow = options.allowedWindow ?? 1;
  }

  public generateSecret(): string {
    return encodeBase32(randomBytes(20));
  }

  public createOtpAuthUri(accountName: string, secret: string): string {
    const label = `${this.options.issuer}:${accountName}`;
    const query = new URLSearchParams({
      secret,
      issuer: this.options.issuer,
      algorithm: 'SHA1',
      digits: String(this.digits),
      period: String(this.periodSeconds),
    });
    return `otpauth://totp/${encodeURIComponent(label)}?${query.toString()}`;
  }

  public generateCode(secret: string, date = new Date()): string {
    return this.generateForCounter(secret, Math.floor(date.getTime() / 1_000 / this.periodSeconds));
  }

  public verifyCode(secret: string, code: string, date = new Date()): boolean {
    if (code.length !== this.digits || !containsOnlyAsciiDigits(code)) {
      return false;
    }

    const counter = Math.floor(date.getTime() / 1_000 / this.periodSeconds);
    for (let offset = -this.allowedWindow; offset <= this.allowedWindow; offset += 1) {
      const expected = Buffer.from(this.generateForCounter(secret, counter + offset));
      const actual = Buffer.from(code);
      if (expected.length === actual.length && timingSafeEqual(expected, actual)) {
        return true;
      }
    }
    return false;
  }

  private generateForCounter(secret: string, counter: number): string {
    const buffer = Buffer.alloc(8);
    buffer.writeBigUInt64BE(BigInt(counter));
    const digest = createHmac('sha1', decodeBase32(secret)).update(buffer).digest();
    const lastByte = digest.at(-1);
    if (lastByte === undefined) {
      throw new Error('Unable to generate TOTP code.');
    }
    const offset = lastByte & 0x0f;
    const binary = digest.readUInt32BE(offset) & 0x7fffffff;
    return String(binary % 10 ** this.digits).padStart(this.digits, '0');
  }
}

function containsOnlyAsciiDigits(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const characterCode = value.charCodeAt(index);
    if (characterCode < 48 || characterCode > 57) {
      return false;
    }
  }
  return true;
}

function encodeBase32(value: Buffer): string {
  let bits = 0;
  let accumulator = 0;
  let result = '';
  for (const byte of value) {
    accumulator = (accumulator << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      result += base32Character((accumulator >>> bits) & 31);
    }
  }
  if (bits > 0) {
    result += base32Character((accumulator << (5 - bits)) & 31);
  }
  return result;
}

function base32Character(index: number): string {
  const character = BASE32_ALPHABET.at(index);
  if (character === undefined) {
    throw new Error('Unable to encode TOTP secret.');
  }
  return character;
}

function decodeBase32(value: string): Buffer {
  let bits = 0;
  let accumulator = 0;
  const bytes: number[] = [];
  for (const character of value.toUpperCase().replaceAll('=', '')) {
    const index = BASE32_ALPHABET.indexOf(character);
    if (index === -1) {
      throw new Error('TOTP secret is not valid base32.');
    }
    accumulator = (accumulator << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((accumulator >>> bits) & 0xff);
    }
  }
  return Buffer.from(bytes);
}
