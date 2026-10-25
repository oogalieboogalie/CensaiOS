// Test-only shortcuts (everyone is user 1, every rate limit off, the test
// session in the API Bar) must never run in a real install. NODE_ENV=test
// alone is not enough: it is a plain setting anyone can type. They count only
// while jest itself is running, which always sets JEST_WORKER_ID.
export function isJestRun(env = process.env) {
  return env.NODE_ENV === 'test' && Boolean(env.JEST_WORKER_ID);
}
