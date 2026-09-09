import { createFamilyHealingReceipt } from './gate.js';

export async function runHealingCascadeIfMentioned() {
  return createFamilyHealingReceipt('mention_cascade');
}
