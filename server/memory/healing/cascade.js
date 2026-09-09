import { createFamilyHealingReceipt } from './gate.js';

export async function detectMemoryGap() {
  return createFamilyHealingReceipt('detect_memory_gap');
}

export async function triggerHealingCascade() {
  return createFamilyHealingReceipt('healing_cascade');
}
