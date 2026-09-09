const BASE = () => (process.env.QDRANT_URL || 'http://localhost:6333').replace(/\/+$/, '');
const COLLECTION = 'memories';

let collectionReady = false;

export async function checkQdrantHealth() {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), 2000);
  try {
    const res = await fetch(`${BASE()}/collections/${COLLECTION}`, { signal: controller.signal });
    clearTimeout(id);
    if (res.ok) {
      collectionReady = true;
      return { ready: true, connected: true, collection: COLLECTION };
    }
    return { ready: false, connected: true, error: `Collection ${COLLECTION} not found (HTTP ${res.status})` };
  } catch (err) {
    return { ready: false, connected: false, error: err.message };
  }
}

async function ensureCollection(dimension) {
  if (collectionReady) return true;
  try {
    const check = await fetch(`${BASE()}/collections/${COLLECTION}`);
    if (check.ok) { collectionReady = true; return true; }

    const res = await fetch(`${BASE()}/collections/${COLLECTION}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vectors: { size: dimension, distance: 'Cosine' },
      }),
    });
    collectionReady = res.ok;
    return res.ok;
  } catch (err) {
    console.warn('Qdrant unreachable:', err.message);
    return false;
  }
}

export async function upsertVector(id, vector, payload) {
  const ok = await ensureCollection(vector.length);
  if (!ok) return false;

  try {
    const res = await fetch(`${BASE()}/collections/${COLLECTION}/points`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        points: [{ id, vector, payload }],
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function searchVectors(vector, filter, limit = 10) {
  if (!collectionReady) return [];

  try {
    const body = { vector, limit, with_payload: true };
    if (filter) body.filter = filter;

    const res = await fetch(`${BASE()}/collections/${COLLECTION}/points/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.result || [];
  } catch {
    return [];
  }
}

export async function deleteVector(id) {
  if (!collectionReady) return;
  try {
    await fetch(`${BASE()}/collections/${COLLECTION}/points/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ points: [id] }),
    });
  } catch {}
}
