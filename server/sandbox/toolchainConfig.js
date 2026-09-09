/**
 * Toolchain Config Store
 *
 * Persists toolchain selections and user-provided API keys to
 * .homebase-state/toolchain-config.json on the host filesystem.
 *
 * Shape:
 * {
 *   "enabled": ["opencode", "gemini"],
 *   "apiKeys": {
 *     "gemini": "AIza...",
 *     "claudecode": "sk-ant-..."
 *   }
 * }
 *
 * API key values stored here are preferred at runtime over .env values,
 * giving the UI a simple "enter your key here" override path.
 */

import fs from 'fs';
import path from 'path';
import { createLogger } from '../logger.js';

const log = createLogger('toolchain-config');

// Store config next to the existing .homebase-state volume mount path.
const STATE_DIR = process.env.HOMEBASE_STATE_DIR
  || path.resolve(process.cwd(), '.homebase-state');

const CONFIG_PATH = path.join(STATE_DIR, 'toolchain-config.json');

const DEFAULT_CONFIG = { enabled: [], apiKeys: {} };

/**
 * Read the toolchain config from disk. Returns default if missing or corrupt.
 * @returns {{ enabled: string[], apiKeys: Record<string, string> }}
 */
export function readToolchainConfig() {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      enabled: Array.isArray(parsed.enabled) ? parsed.enabled : [],
      apiKeys: parsed.apiKeys && typeof parsed.apiKeys === 'object' ? parsed.apiKeys : {},
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

/**
 * Persist the toolchain config to disk.
 * @param {{ enabled: string[], apiKeys: Record<string, string> }} config
 */
export function writeToolchainConfig(config) {
  try {
    fs.mkdirSync(STATE_DIR, { recursive: true });
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
    log.info('toolchain config saved', { enabled: config.enabled });
  } catch (err) {
    log.error('failed to save toolchain config', { error: err.message });
    throw err;
  }
}

/**
 * Resolve the API key for a given CLI.
 * Priority: user-saved key in config file → env var.
 *
 * @param {string} envKey  e.g. 'GEMINI_API_KEY'
 * @returns {string|undefined}
 */
export function resolveApiKey(envKey) {
  const config = readToolchainConfig();
  return config.apiKeys[envKey] || process.env[envKey];
}
