import { generateSync, createGuardrails } from 'otplib';
import { checkTotp, newTotpSecret, totpUri } from '../server/hubAccounts/totp.js';

// A 10-byte secret, the length otplib v12 made for every MFA user before the upgrade.
const OLD_SECRET = 'JBSWY3DPEHPK3PXP';
const OLD_GUARDRAILS = createGuardrails({ MIN_SECRET_BYTES: 10 });

describe('hub authenticator codes', () => {
  test('a code from an old (v12-length) secret still signs in', () => {
    const code = generateSync({ secret: OLD_SECRET, guardrails: OLD_GUARDRAILS });
    expect(checkTotp(code, OLD_SECRET)).toBe(true);
  });

  test('a new secret works end to end', () => {
    const secret = newTotpSecret();
    expect(checkTotp(generateSync({ secret }), secret)).toBe(true);
    expect(totpUri('user_1', 'CensaiHub', secret)).toMatch(/^otpauth:\/\/totp\/CensaiHub:user_1\?secret=/);
  });

  test('wrong or malformed codes are refused, never thrown', () => {
    const secret = newTotpSecret();
    expect(checkTotp('000000', secret)).toBe(generateSync({ secret }) === '000000');
    expect(checkTotp('abc', secret)).toBe(false);
    expect(checkTotp('', secret)).toBe(false);
    expect(checkTotp('123456', '')).toBe(false);
    expect(checkTotp('123456', 'not base32!')).toBe(false);
  });
});
