import { describe, expect, it } from 'vitest';

import { loadSecurityEnvironment } from '../../src/config/security-environment.js';
import {
  formatDevelopmentSecrets,
  generateDevelopmentSecrets,
} from '../../scripts/generate-development-secrets.js';

function parseEnvironment(output: string): NodeJS.ProcessEnv {
  return Object.fromEntries(
    output.split('\n').map((line) => {
      const separator = line.indexOf('=');
      return [line.slice(0, separator), line.slice(separator + 1)];
    }),
  );
}

describe('security environment', () => {
  it('generates a complete configuration with parseable keys', () => {
    const generated = generateDevelopmentSecrets();
    const environment = parseEnvironment(formatDevelopmentSecrets(generated));
    const security = loadSecurityEnvironment(environment);

    expect(security.encryptionKeys.get('v1')).toHaveLength(32);
    expect(security.jwtPrivateKeyPem).toContain('PRIVATE KEY');
    expect(security.jwtPublicKeyPem).toContain('PUBLIC KEY');
    expect(generated.demoPassword).toHaveLength(24);
    expect(generated.demoMfaSecret).toMatch(/^[A-Z2-7]+$/u);
  });

  it('fails fast when security configuration is incomplete', () => {
    expect(() => loadSecurityEnvironment({ AMRUTAM_JWT_KEY_ID: 'only-one-setting' })).toThrow(
      'Invalid security configuration',
    );
  });

  it('rejects a mismatched JWT key pair', () => {
    const first = generateDevelopmentSecrets();
    const second = generateDevelopmentSecrets();
    const environment = parseEnvironment(formatDevelopmentSecrets(first));
    environment.AMRUTAM_JWT_PUBLIC_KEY_BASE64 = second.jwtPublicKeyBase64;

    expect(() => loadSecurityEnvironment(environment)).toThrow('matching key pair');
  });
});
