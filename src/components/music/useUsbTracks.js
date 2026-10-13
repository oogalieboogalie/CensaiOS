import React from 'react';
import { isAudioFile, titleFromFileName } from './musicLibrary.js';

// The device's "USB stick": audio files this person loaded from their own
// computer. They are kept in this browser's IndexedDB so they survive a
// reload, and they are never uploaded, so nobody else on the board hears
// them. Storage failures (private windows, quota) fall back to keeping the
// files for this session only.

const DB_NAME = 'censai-music';
const STORE = 'usb';
export const USB_TRACK_LIMIT = 100;

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('no indexedDB')); return; }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore(mode, fn) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const result = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(result?.result ?? result);
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

function toTrack(record) {
  return {
    id: record.id,
    title: record.title,
    name: record.name,
    size: record.size,
    addedAt: record.addedAt,
    url: URL.createObjectURL(record.blob),
  };
}

let idCounter = 0;
const newId = () => `usb-${Date.now().toString(36)}-${(idCounter++).toString(36)}`;

export function useUsbTracks() {
  const [tracks, setTracks] = React.useState([]);
  const urlsRef = React.useRef(new Set());

  const remember = React.useCallback((list) => {
    list.forEach(t => urlsRef.current.add(t.url));
    return list;
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    withStore('readonly', store => store.getAll())
      .then((records) => {
        if (cancelled || !Array.isArray(records)) return;
        const sorted = records.sort((a, b) => (a.addedAt || 0) - (b.addedAt || 0));
        setTracks(prev => [...remember(sorted.map(toTrack)), ...prev]);
      })
      .catch(() => {});
    const urls = urlsRef.current;
    return () => {
      cancelled = true;
      urls.forEach(url => URL.revokeObjectURL(url));
      urls.clear();
    };
  }, [remember]);

  const addFiles = React.useCallback((fileList) => {
    const files = Array.from(fileList || []).filter(isAudioFile).slice(0, USB_TRACK_LIMIT);
    if (files.length === 0) return [];
    const records = files.map((file, i) => ({
      id: newId(),
      name: file.name,
      title: titleFromFileName(file.name),
      size: file.size,
      addedAt: Date.now() + i,
      blob: file,
    }));
    const added = remember(records.map(toTrack));
    setTracks(prev => [...prev, ...added].slice(-USB_TRACK_LIMIT));
    withStore('readwrite', (store) => { records.forEach(r => store.put(r)); }).catch(() => {});
    return added;
  }, [remember]);

  const removeTrack = React.useCallback((id) => {
    setTracks(prev => prev.filter(t => t.id !== id));
    withStore('readwrite', store => store.delete(id)).catch(() => {});
  }, []);

  return { tracks, addFiles, removeTrack };
}
