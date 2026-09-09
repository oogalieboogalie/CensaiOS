
/** List all registered providers with their connection state. */
export async function getProviders() {
    const res = await fetch('/api/providers');
    if (!res.ok) throw new Error('Failed to fetch providers');
    return await res.json();
  }

/** Connection status for one provider (no live probe). */
export async function getProviderStatus(id) {
    const res = await fetch(`/api/providers/${encodeURIComponent(id)}/status`);
    if (!res.ok) throw new Error('Failed to fetch provider status');
    return await res.json();
  }

/** Run a live connection test for one provider. Returns { id, state, configured, detail? }. */
export async function testProvider(id) {
    const res = await fetch(`/api/providers/${encodeURIComponent(id)}/test`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to test provider');
    return await res.json();
  }
