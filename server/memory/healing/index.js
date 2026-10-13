// Family healing is not part of the open source build. The gate still reports
// its state, and every healing call is a no-op that returns a "not run" receipt.
import { createFamilyHealingReceipt } from './gate.js';

export * from './gate.js';

export function extractMentionedAgents() {
  return [];
}

export async function checkMemberMemory() {
  return false;
}

export async function detectMemoryGap() {
  return createFamilyHealingReceipt('detect_memory_gap');
}

export async function triggerHealingCascade() {
  return createFamilyHealingReceipt('trigger_healing_cascade');
}

export async function runHealingCascadeIfMentioned() {
  return createFamilyHealingReceipt('run_healing_cascade_if_mentioned');
}
