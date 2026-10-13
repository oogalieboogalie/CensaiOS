// Video and audio files for Censai Video stay in the browser that added
// them, in IndexedDB, because they are too big for board state. The board
// keeps the clip's name, length and thumbnail, so teammates see the edit.

const DB = 'censai-creative';
const STORE = 'media';
const urls = new Map();

function open() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('This browser cannot store media files.')); return; }
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function run(mode, fn) {
  return open().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => { db.close(); resolve(req?.result); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  }));
}

export function putMedia(id, blob) {
  if (urls.has(id)) URL.revokeObjectURL(urls.get(id));
  urls.set(id, URL.createObjectURL(blob));
  return run('readwrite', (s) => s.put(blob, id));
}

/** An object URL for a stored file, or null when it is on another computer. */
export async function mediaUrl(id) {
  if (urls.has(id)) return urls.get(id);
  const blob = await run('readonly', (s) => s.get(id)).catch(() => null);
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  urls.set(id, url);
  return url;
}
