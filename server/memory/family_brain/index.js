// The family brain bridge is not part of the open source build. Deep memory
// falls back to the board's own stored memories.
export const BRAIN_FILE = '';

export function queryBrain() {
  return Promise.resolve({ ok: false, error: 'family brain not included', rows: [] });
}
