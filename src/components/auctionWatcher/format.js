// Plain-words numbers for the Auction Watcher (unit-tested).

export const SITES = Object.freeze({ shopgoodwill: 'Goodwill', ebay: 'eBay' });

export const INTERVALS = Object.freeze([
  { minutes: 15, label: 'every 15 min' },
  { minutes: 30, label: 'every 30 min' },
  { minutes: 60, label: 'every hour' },
  { minutes: 180, label: 'every 3 hours' },
  { minutes: 720, label: 'twice a day' },
  { minutes: 1440, label: 'once a day' },
]);

export function intervalLabel(minutes) {
  return INTERVALS.find((i) => i.minutes === minutes)?.label || `every ${minutes} min`;
}

export function dollars(value, currency = 'USD') {
  if (!Number.isFinite(value)) return '—';
  const sign = currency === 'USD' ? '$' : `${currency} `;
  return `${sign}${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** "2d 4h left", "38m left", "ended". */
export function timeLeft(endsAt, now = Date.now()) {
  if (!endsAt) return 'no end time';
  const ms = new Date(endsAt).getTime() - now;
  if (!Number.isFinite(ms)) return 'no end time';
  if (ms <= 0) return 'ended';
  const minutes = Math.floor(ms / 60000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  if (days > 0) return `${days}d ${hours}h left`;
  if (hours > 0) return `${hours}h ${minutes % 60}m left`;
  return `${Math.max(1, minutes)}m left`;
}

/** Less than an hour to go: the card shows it in the warning color. */
export function endingSoon(endsAt, now = Date.now()) {
  const ms = new Date(endsAt).getTime() - now;
  return Number.isFinite(ms) && ms > 0 && ms < 3600000;
}

export function agoText(iso, now = Date.now()) {
  if (!iso) return 'not checked yet';
  const minutes = Math.round((now - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return 'checked just now';
  if (minutes < 60) return `checked ${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `checked ${hours}h ago` : `checked ${Math.round(hours / 24)} days ago`;
}
