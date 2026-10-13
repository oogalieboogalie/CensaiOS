const BOOLEAN_TRUE = new Set(['true', '1', 'yes', 'on', 'enabled']);
const BOOLEAN_FALSE = new Set(['false', '0', 'no', 'off', 'disabled']);

export const FAMILY_HEALING_DISABLED = 'family_healing_disabled';
export const FAMILY_HEALING_UNTRUSTED = 'family_healing_untrusted';
export const FAMILY_HEALING_ENABLED = 'family_healing_enabled';

export const FAMILY_HEALING_ZERO_EFFECTS = Object.freeze({
  databaseWrites: 0,
  memoryWrites: 0,
  gapWrites: 0,
  healingWrites: 0,
  associationWrites: 0,
  vectorWrites: 0,
  hologramWrites: 0,
  providerCalls: 0,
  embeddingCalls: 0,
  usageEvents: 0,
});

function readHealingFlag(env) {
  const raw = String(env.FAMILY_HEALING_ENABLED ?? '').trim().toLowerCase();
  if (!raw || BOOLEAN_FALSE.has(raw)) return { enabled: false, valid: true };
  if (BOOLEAN_TRUE.has(raw)) return { enabled: true, valid: true };
  return { enabled: false, valid: false };
}

// The gate is now functional: FAMILY_HEALING_ENABLED=true (valid values:
// true/1/yes/on/enabled) makes healing executable. Invalid values still fail
// closed. An unset flag keeps healing off, same as before — but it no longer
// degrades boundary readiness, and enabling it no longer blocks the app.
export function getFamilyHealingGate(env = process.env) {
  const flag = readHealingFlag(env);
  const enabled = flag.valid && flag.enabled;
  return Object.freeze({
    ready: flag.valid,
    enabled,
    configurationValid: flag.valid,
    executable: enabled,
    state: !flag.valid ? 'blocked' : (enabled ? 'enabled' : 'disabled'),
    reason: !flag.valid
      ? FAMILY_HEALING_UNTRUSTED
      : (enabled ? FAMILY_HEALING_ENABLED : FAMILY_HEALING_DISABLED),
  });
}

export function createFamilyHealingReceipt(
  operation,
  env = process.env,
  { executed = false, effects = {}, details = null } = {}
) {
  const gate = getFamilyHealingGate(env);
  const ran = executed && gate.executable;
  return Object.freeze({
    ok: ran,
    status: gate.state,
    code: ran
      ? 'FAMILY_HEALING_ENABLED'
      : (gate.ready ? 'FAMILY_HEALING_DISABLED' : 'FAMILY_HEALING_UNTRUSTED'),
    reason: gate.reason,
    operation,
    enabled: gate.enabled,
    executed: ran,
    effects: Object.freeze({ ...FAMILY_HEALING_ZERO_EFFECTS, ...effects }),
    ...(details ? { details: Object.freeze({ ...details }) } : {}),
  });
}
