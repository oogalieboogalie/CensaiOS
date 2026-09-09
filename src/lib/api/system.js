export async function getToolCatalog() {
    const res = await fetch('/api/tool-catalog');
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || 'Failed to fetch tool catalog');
    return data;
  }

export async function getJulesSessions({ refresh = false, includeCompleted = false } = {}) {
    const params = new URLSearchParams();
    if (refresh) params.set('refresh', 'true');
    if (includeCompleted) params.set('includeCompleted', 'true');
    const res = await fetch(`/api/jules/sessions?${params}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || 'Failed to fetch Jules sessions');
    return data;
  }

export async function getJulesQueue() {
    const res = await fetch('/api/jules/queue');
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || 'Failed to fetch Jules queue');
    return data;
  }

export async function getSession() {
  const res = await fetch('/api/auth/session');
  if (!res.ok) throw new Error(`Session check failed (HTTP ${res.status})`);
  return res.json().catch(() => {
    throw new Error('Session check returned an invalid response');
  });
}

export async function logout() {
  const res = await fetch('/api/auth/logout', { method: 'POST' });
  return res.json().catch(() => ({ authenticated: false }));
}

export async function developerLogin({ email, name }) {
  // The server may briefly return 503 during boot while the DB schema is being
  // bootstrapped (see /api/auth/developer handler). Retry once or twice with a
  // short backoff so the user doesn't have to click "Enter Canvas" twice on a
  // cold start.
  const MAX_ATTEMPTS = 3;
  let lastErr = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const res = await fetch('/api/auth/developer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, name }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) return data;
    // Only retry on 503 (DB initializing). 4xx / 5xx with a real error
    // message is surfaced immediately - those aren't transient.
    if (res.status !== 503) {
      throw new Error(data?.error || 'Login failed');
    }
    lastErr = new Error(data?.error || 'Login failed');
    // Respect Retry-After if the server sent one; otherwise small backoff.
    const retryAfter = Number(res.headers.get('Retry-After')) || 2;
    if (attempt < MAX_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
    }
  }
  throw lastErr || new Error('Login failed');
}
