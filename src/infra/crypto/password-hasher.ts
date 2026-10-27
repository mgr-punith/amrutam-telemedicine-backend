import argon2 from 'argon2';

const MINIMUM_PASSWORD_LENGTH = 12;

export class PasswordHasher {
  public async hash(password: string): Promise<string> {
    this.assertPasswordPolicy(password);
    return argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 65_536,
      timeCost: 3,
      parallelism: 1,
    });
  }

  public async verify(hash: string, password: string): Promise<boolean> {
    if (!hash.startsWith('$argon2id$')) {
      return false;
    }

    try {
      return await argon2.verify(hash, password);
    } catch {
      return false;
    }
  }

  private assertPasswordPolicy(password: string): void {
    if (password.length < MINIMUM_PASSWORD_LENGTH) {
      throw new Error(
        `Password must contain at least ${MINIMUM_PASSWORD_LENGTH.toString()} characters.`,
      );
    }
  }
}
