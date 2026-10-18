// src/lib/agentMemory/timeWords.js
//
// Times in words an agent (and a person) can read: "Sat 2026-10-17 18:04:12 CDT"
// and "about 2 minutes". Shared by the server (what the model sees) and the
// app (Recents, Past conversations). The person's own time zone comes from
// their browser; a zone the runtime does not know falls back to the default.

export function safeTimeZone(zone) {
  const name = String(zone || '').trim();
  if (!name || name.length > 64) return undefined;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: name });
    return name;
  } catch {
    return undefined;
  }
}

function parts(date, timeZone) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone, weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', timeZoneName: 'short',
  });
  return Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
}

/** "Sat 2026-10-17 18:04:12 CDT" (seconds included so short gaps are visible). */
export function stamp(value, timeZone) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const p = parts(date, safeTimeZone(timeZone));
  return `${p.weekday} ${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second} ${p.timeZoneName}`;
}

/** A gap in plain words: "12 seconds", "about a minute", "3 hours", "2 days". */
export function gapWords(fromValue, toValue) {
  const ms = new Date(toValue).getTime() - new Date(fromValue).getTime();
  if (!Number.isFinite(ms)) return '';
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 50) return `${s} second${s === 1 ? '' : 's'}`;
  if (s < 90) return 'about a minute';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} minutes`;
  const h = Math.round(m / 60);
  if (h < 36) return h === 1 ? 'about an hour' : `${h} hours`;
  const d = Math.round(h / 24);
  return `${d} days`;
}

/** "18 minutes ago" for lists; "just now" under a minute. */
export function agoWords(value, now = new Date()) {
  const ms = new Date(now).getTime() - new Date(value).getTime();
  if (!Number.isFinite(ms) || ms < 60_000) return 'just now';
  return `${gapWords(value, now).replace(/^about /, '')} ago`;
}
