// Plain-words numbers for the AI resources window.

export function money(usd) {
  const n = Number(usd);
  if (!Number.isFinite(n)) return '—';
  if (n === 0) return '$0.00';
  if (Math.abs(n) < 0.01) return n < 0 ? '-<$0.01' : '<$0.01';
  return `${n < 0 ? '-' : ''}$${Math.abs(n).toFixed(2)}`;
}

export function tokens(count) {
  const n = Number(count) || 0;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export function when(iso) {
  if (!iso) return 'not yet';
  const t = typeof iso === 'number' ? iso : Date.parse(iso);
  return Number.isFinite(t) && t > 0 ? new Date(t).toLocaleString() : 'not yet';
}

const SOURCES = {
  vault: 'Your key (Settings, Bring Your Own Key)',
  env: 'This computer\'s .env file',
  shared: 'This computer\'s key, shared with you by the owner',
  allowance: 'censaiOS free allowance',
  local: 'A model on your own computer',
};

export function sourceLabel(source) {
  return SOURCES[source] || 'Another key';
}

/** How much of a starting amount is used, 0..1, or null with no amount. */
export function usedShare(card) {
  if (card?.budgetUsd == null || !(card.budgetUsd > 0)) return null;
  return Math.min(1, Math.max(0, (card.budgetUsd - card.leftUsd) / card.budgetUsd));
}
