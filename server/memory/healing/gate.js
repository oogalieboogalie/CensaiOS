const BOOLEAN_TRUE = new Set(['true', '1', 'yes', 'on', 'enabled']);
const BOOLEAN_FALSE = new Set(['false', '0', 'no', 'off', 'disabled']);

export const FAMILY_HEALING_DISABLED = 'family_healing_disabled';
export const FAMILY_HEALING_UNTRUSTED = 'family_healing_untrusted';

function readHealingFlag(env) {
  const raw = String(env.FAMILY_HEALING_ENABLED ?? '').trim().toLowerCase();
  if (!raw || BOOLEAN_FALSE.has(raw)) return { enabled: false, valid: true };
  if (BOOLEAN_TRUE.has(raw)) return { enabled: true, valid: true };
  return { enabled: false, valid: false };
}

export function getFamilyHealingGate(env = process.env) {
  const flag = readHealingFlag(env);
  const safelyDisabled = flag.valid && !flag.enabled;
  return Object.freeze({
    ready: safelyDisabled,
    enabled: flag.enabled,
    configurationValid: flag.valid,
    executable: false,
    state: safelyDisabled ? 'disabled' : 'blocked',
    reason: safelyDisabled ? FAMILY_HEALING_DISABLED : FAMILY_HEALING_UNTRUSTED,
  });
}

export function createFamilyHealingReceipt(operation, env = process.env) {
  const gate = getFamilyHealingGate(env);
  return Object.freeze({
    ok: gate.ready,
    status: gate.state,
    code: gate.ready ? 'FAMILY_HEALING_DISABLED' : 'FAMILY_HEALING_UNTRUSTED',
    reason: gate.reason,
    operation,
    enabled: gate.enabled,
    executed: false,
    effects: Object.freeze({
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
    }),
  });
}
