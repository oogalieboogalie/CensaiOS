// Audio files for the Studio live in this browser's IndexedDB, keyed by the
// asset id the project refers to. They are never uploaded: the board only
// carries each file's name, length and waveform. Storage failures (private
// windows, quota) fall back to memory for this session.

const DB_NAME = 'censai-studio';
const STORE = 'assets';
const memory = new Map();

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('no indexedDB')); return; }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(mode, fn) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const req = fn(t.objectStore(STORE));
      t.oncomplete = () => resolve(req?.result);
      t.onerror = () => reject(t.error);
    });
  } finally {
    db.close();
  }
}

export async function saveAsset(id, blob, name) {
  memory.set(id, { id, blob, name });
  try { await tx('readwrite', s => s.put({ id, blob, name, addedAt: Date.now() })); } catch { /* memory copy still works this session */ }
}

export async function loadAsset(id) {
  if (memory.has(id)) return memory.get(id);
  try {
    const rec = await tx('readonly', s => s.get(id));
    if (rec) memory.set(id, rec);
    return rec || null;
  } catch {
    return null;
  }
}

/** Coarse waveform for the timeline: up to `bins` peaks scaled 0..99. */
export function computePeaks(channels, bins = 400) {
  const len = channels[0]?.length || 0;
  const count = Math.max(1, Math.min(bins, Math.ceil(len / 256)));
  const step = len / count;
  const out = new Array(count).fill(0);
  for (let b = 0; b < count; b++) {
    let m = 0;
    const from = Math.floor(b * step); const to = Math.floor((b + 1) * step);
    for (const ch of channels) for (let i = from; i < to; i += 4) { const a = Math.abs(ch[i]); if (a > m) m = a; }
    out[b] = Math.min(99, Math.round(Math.sqrt(m) * 99));
  }
  return out;
}
