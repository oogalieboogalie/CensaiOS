// Authenticator-app codes (TOTP) for hub accounts, on otplib v13.
// Secrets made by the older otplib v12 are 10 bytes; v13 refuses anything under
// 16 by default, so the guardrail is lowered to keep existing MFA users signing in.
// New secrets still use v13's stronger default length.
import { createGuardrails, generateSecret, generateURI, verifySync } from 'otplib';

const LEGACY_SECRET_GUARDRAILS = createGuardrails({ MIN_SECRET_BYTES: 10 });

export function newTotpSecret() {
  return generateSecret();
}

export function totpUri(label, issuer, secret) {
  return generateURI({ label, issuer, secret });
}

// v12's authenticator.check returned false on any bad input; v13 throws on
// malformed tokens or secrets, so treat a throw as "wrong code".
export function checkTotp(code, secret) {
  if (!code || !secret) return false;
  try {
    return verifySync({ secret, token: String(code).trim(), guardrails: LEGACY_SECRET_GUARDRAILS }).valid === true;
  } catch {
    return false;
  }
}
