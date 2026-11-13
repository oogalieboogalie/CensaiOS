// Who can sign up: email domains an admin lets in (server/signInDomains/routes.js).

async function signInDomainRequest(path, options = {}) {
  const response = await fetch(path, { credentials: 'include', ...options });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || `Could not load who can sign up (HTTP ${response.status})`);
    error.status = response.status;
    throw error;
  }
  return payload;
}

export function getSignInDomains() {
  return signInDomainRequest('/api/sign-in-domains');
}

export function addSignInDomain(domain) {
  return signInDomainRequest('/api/sign-in-domains', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ domain }),
  });
}

export function removeSignInDomain(domain) {
  return signInDomainRequest(`/api/sign-in-domains/${encodeURIComponent(domain)}`, { method: 'DELETE' });
}
