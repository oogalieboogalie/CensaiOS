// Browser side of /api/agent-import/hosted (server/routes/hostedAgents.js).

export async function getHostedVendors() {
  const res = await fetch('/api/agent-import/hosted/vendors');
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Hosted agents could not load.');
  return data.vendors || [];
}

export async function postHosted(path, body) {
  const res = await fetch(`/api/agent-import/hosted/${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `censaiOS answered ${res.status}.`);
  return data;
}
