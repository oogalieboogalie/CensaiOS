// Plain words for agent receipts (server/agentNetwork/receipts.js), shared
// by the Receipts tab, help cards and chat messages. Pure, so it is tested.

export function formatTokens(n) {
  const value = Math.max(0, Math.round(Number(n) || 0));
  return `${value.toLocaleString('en-US')} token${value === 1 ? '' : 's'}`;
}

export function formatDuration(ms) {
  if (ms === null || ms === undefined || ms === '') return null;
  const value = Number(ms);
  if (!Number.isFinite(value) || value < 0) return null;
  if (value < 1000) return `${Math.round(value)} ms`;
  if (value < 60_000) return `${(value / 1000).toFixed(1)} s`;
  return `${Math.round(value / 60_000)} min`;
}

export function formatPrice(price) {
  if (!price || !Number.isFinite(Number(price.cents))) return 'no price';
  const amount = (Number(price.cents) / 100).toFixed(2);
  return price.currency && price.currency !== 'USD' ? `${amount} ${price.currency}` : `$${amount}`;
}

/** A short install id for people: "ci_3f9a…c21b". */
export function shortInstall(id) {
  const value = String(id || '');
  return value.length > 14 ? `${value.slice(0, 7)}…${value.slice(-4)}` : value;
}

export function shortHash(hex) {
  const value = String(hex || '');
  return value ? `${value.slice(0, 10)}…` : '—';
}

/** "Signed receipt · 1,234 tokens · 4.2 s" for a receipt summary. */
export function receiptLine(summary) {
  if (!summary) return '';
  const parts = [
    summary.verified ? 'Signed receipt' : 'Receipt (signature does not check out)',
    formatTokens(summary.tokens),
    formatDuration(summary.durationMs),
    summary.price ? formatPrice(summary.price) : null,
    summary.counterVerified === true ? 'both sides signed' : null,
  ];
  return parts.filter(Boolean).join(' · ');
}

const ROLE_TEXT = {
  asker: 'Asked from here',
  helper: 'Answered here',
  both: 'Asked and answered here',
};

export function roleText(role) {
  return ROLE_TEXT[role] || role;
}

const CHANNEL_TEXT = {
  board: 'on this board',
  endpoint: 'straight to the other computer',
  relay: 'through the relay',
};

export function channelText(channel) {
  return CHANNEL_TEXT[channel] || channel;
}
