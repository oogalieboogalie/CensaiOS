import { createLogger } from '../logger.js';

const apiLog = createLogger('api');

const WORKSPACE_KEY = 'homebase.workspace.v1';
const JOURNALS_KEY = 'homebase.journals.v1';
const PRESETS_KEY = 'homebase.presets.v1';
const THEME_CUSTOM_PRESETS_KEY = 'homebase.theme.customPresets.v1';
const CLIENT_STATE_ENDPOINT = '/api/client-state';
const STORAGE_MISS = Symbol('homebase.storage.miss');

function getLocalStorage() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const testKey = '__homebase_storage_probe__';
    window.localStorage.setItem(testKey, '1');
    window.localStorage.removeItem(testKey);
    return window.localStorage;
  } catch {
    return null;
  }
}

function readLocalStoredJson(key) {
  const storage = getLocalStorage();
  if (storage) {
    try {
      const raw = storage.getItem(key);
      if (raw !== null) return JSON.parse(raw);
    } catch (e) {
      console.warn(`Failed to read ${key} from local storage`, e);
    }
  }
  return STORAGE_MISS;
}

async function readServerStoredJson(key) {
  return readApiStoredJson(key);
}

async function readApiStoredJson(key) {
  try {
    const res = await fetch(`${CLIENT_STATE_ENDPOINT}/${encodeURIComponent(key)}`);
    if (res.status === 404) return STORAGE_MISS;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data?.value ?? STORAGE_MISS;
  } catch (e) {
    console.warn(`Failed to read ${key} from local client state`, e);
    return STORAGE_MISS;
  }
}

async function readStoredJson(key, fallback) {
  const serverValue = await readServerStoredJson(key);
  const localValue = readLocalStoredJson(key);

  if (serverValue !== STORAGE_MISS && localValue !== STORAGE_MISS) {
    // Both exist, let's compare timestamps!
    const serverTime = serverValue.updatedAt ? Date.parse(serverValue.updatedAt) : 0;
    const localTime = localValue.updatedAt ? Date.parse(localValue.updatedAt) : 0;

    if (localTime > serverTime) {
      console.log(`[Sync] Local storage value is newer (${localValue.updatedAt}) than server value (${serverValue.updatedAt}). Using local and syncing back to server in background.`);
      // Sync local value back to server asynchronously
      writeServerStoredJson(key, localValue).catch(e => console.warn("Failed to sync local value to server", e));
      return localValue;
    } else {
      console.log(`[Sync] Server value is newer or equal (${serverValue.updatedAt}) than local value (${localValue.updatedAt}). Updating local storage.`);
      const storage = getLocalStorage();
      if (storage) {
        try { storage.setItem(key, JSON.stringify(serverValue)); } catch {}
      }
      return serverValue;
    }
  }

  if (serverValue !== STORAGE_MISS) {
    const storage = getLocalStorage();
    if (storage) {
      try { storage.setItem(key, JSON.stringify(serverValue)); } catch {}
    }
    return serverValue;
  }

  return localValue !== STORAGE_MISS ? localValue : fallback;
}

async function writeServerStoredJson(key, value, options = {}) {
  let saved = false;
  let lastError = null;

  try {
    const res = await fetch(`${CLIENT_STATE_ENDPOINT}/${encodeURIComponent(key)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        value,
        allowEmpty: options.allowEmpty === true,
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data?.error || `HTTP ${res.status}`);
    }
    saved = true;
  } catch (e) {
    lastError = e;
    console.warn(`Failed to write ${key} to local client state`, e);
  }

  if (!saved) throw lastError || new Error(`Failed to write ${key} to server state`);
}

async function writeStoredJson(key, value, options = {}) {
  // Inject updatedAt timestamp so we can track modification times
  const enrichedValue = Array.isArray(value)
    ? value
    : value && typeof value === 'object'
      ? { ...value, updatedAt: new Date().toISOString() }
      : value;

  let saved = false;
  let serverError = null;

  try {
    await writeServerStoredJson(key, enrichedValue, options);
    saved = true;
  } catch (e) {
    serverError = e;
    if (options.requireServer) throw e;
    console.warn(`Failed to save ${key} to server state`, e);
  }

  const storage = getLocalStorage();
  if (storage) {
    try {
      storage.setItem(key, JSON.stringify(enrichedValue));
      saved = true;
    } catch (e) {
      console.warn(`Failed to save ${key} to local storage`, e);
    }
  }

  if (!saved) throw serverError || new Error(`Failed to save ${key}`);
}

async function removeStoredJson(key) {
  const storage = getLocalStorage();
  if (storage) {
    try { storage.removeItem(key); } catch {}
  }

  try {
    const res = await fetch(`${CLIENT_STATE_ENDPOINT}/${encodeURIComponent(key)}`, {
      method: 'DELETE',
    });
    if (!res.ok && res.status !== 404) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data?.error || `HTTP ${res.status}`);
    }
  } catch (e) {
    console.warn(`Failed to remove ${key} from local client state`, e);
  }

}

export {
  getLocalStorage,
  readLocalStoredJson,
  readServerStoredJson,
  readApiStoredJson,
  readStoredJson,
  writeServerStoredJson,
  writeStoredJson,
  removeStoredJson,
  WORKSPACE_KEY,
  JOURNALS_KEY,
  PRESETS_KEY,
  THEME_CUSTOM_PRESETS_KEY,
  CLIENT_STATE_ENDPOINT,
  STORAGE_MISS,
  apiLog
};
