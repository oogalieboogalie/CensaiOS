export const SESSION_RETRY_DELAYS_MS = [0, 200, 350, 500, 700, 900, 1200];

const wait = (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs));

/**
 * A Vite page reload can overlap the API restart triggered by `node --watch`.
 * Keep the app in its authenticating state until that short outage clears.
 */
export async function loadSessionWithRetry(
  loadSession,
  { delays = SESSION_RETRY_DELAYS_MS, waitFor = wait } = {}
) {
  let lastError = null;

  for (const delayMs of delays) {
    if (delayMs > 0) await waitFor(delayMs);
    try {
      return await loadSession();
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('Session server could not be reached');
}
