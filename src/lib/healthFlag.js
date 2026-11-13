// /api/health for someone who is not this computer's owner is only { ok }.
// A flag the detailed answer actually carries wins; otherwise ok stands in,
// so a teammate's task queue is not stuck "blocked" just because the model
// address was left off the public answer.

export function healthFlag(health, read) {
  if (!health || health.error) return false;
  if (typeof read === 'function') {
    const value = read(health);
    if (typeof value === 'boolean') return value;
  }
  return health.ok === true;
}
