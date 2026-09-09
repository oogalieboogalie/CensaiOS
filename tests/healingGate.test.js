import { jest } from '@jest/globals';
import {
  createFamilyHealingReceipt,
  getFamilyHealingGate,
} from '../server/memory/healing/gate.js';
import {
  detectMemoryGap,
  triggerHealingCascade,
} from '../server/memory/healing/cascade.js';
import { runHealingCascadeIfMentioned } from '../server/memory/healing/integration.js';

const ZERO_EFFECTS = {
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
};

describe('family healing execution gate', () => {
  const originalFlag = process.env.FAMILY_HEALING_ENABLED;
  let originalFetch;

  beforeEach(() => {
    delete process.env.FAMILY_HEALING_ENABLED;
    originalFetch = global.fetch;
    global.fetch = jest.fn(() => {
      throw new Error('provider access is forbidden');
    });
  });

  afterEach(() => {
    if (originalFlag === undefined) delete process.env.FAMILY_HEALING_ENABLED;
    else process.env.FAMILY_HEALING_ENABLED = originalFlag;
    global.fetch = originalFetch;
  });

  it('defaults off with an explicit no-effects receipt', async () => {
    expect(getFamilyHealingGate()).toEqual(expect.objectContaining({
      ready: true,
      enabled: false,
      executable: false,
      state: 'disabled',
      reason: 'family_healing_disabled',
    }));

    const receipt = await runHealingCascadeIfMentioned(
      'Breakthrough for every agent',
      'spoofed-user',
      { workspaceId: 'foreign', userId: 'foreign', usageSink: jest.fn() },
    );
    expect(receipt).toEqual(expect.objectContaining({
      ok: true,
      status: 'disabled',
      code: 'FAMILY_HEALING_DISABLED',
      executed: false,
      effects: ZERO_EFFECTS,
    }));
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('gates every legacy entry point before any action', async () => {
    const receipts = await Promise.all([
      detectMemoryGap('atlas', 'event', 'caller', {}),
      triggerHealingCascade('gap', 'atlas', 'event', 'caller', {}),
      runHealingCascadeIfMentioned('Atlas milestone', 'caller', {}),
    ]);
    expect(receipts.map((receipt) => receipt.operation)).toEqual([
      'detect_memory_gap',
      'healing_cascade',
      'mention_cascade',
    ]);
    for (const receipt of receipts) {
      expect(receipt.executed).toBe(false);
      expect(receipt.effects).toEqual(ZERO_EFFECTS);
    }
  });

  it.each(['true', 'invalid'])('blocks unsafe configuration %s', (value) => {
    process.env.FAMILY_HEALING_ENABLED = value;
    const gate = getFamilyHealingGate();
    expect(gate).toEqual(expect.objectContaining({
      ready: false,
      executable: false,
      state: 'blocked',
      reason: 'family_healing_untrusted',
    }));
    expect(createFamilyHealingReceipt('probe')).toEqual(expect.objectContaining({
      ok: false,
      code: 'FAMILY_HEALING_UNTRUSTED',
      executed: false,
      effects: ZERO_EFFECTS,
    }));
  });
});
