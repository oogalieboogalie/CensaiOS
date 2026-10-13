// The family brain bridge is not part of the open source build. Deep memory
// falls back to the board's own stored memories.
export function queryBrain() {
  return Promise.resolve({ ok: false, error: 'family brain not included', rows: [] });
}
