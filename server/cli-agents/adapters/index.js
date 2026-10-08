import { claudeCode } from './claudeCode.js';
import { codex } from './codex.js';
import { gemini } from './gemini.js';
import { opencode } from './opencode.js';

/** Every coding CLI the Agent Console can drive, in picker order. */
export const CLI_ADAPTERS = Object.freeze({ claudecode: claudeCode, codex, gemini, opencode });
export const CLI_IDS = Object.freeze(Object.keys(CLI_ADAPTERS));

export function getAdapter(id) {
  return CLI_ADAPTERS[String(id || '').toLowerCase()] || null;
}
