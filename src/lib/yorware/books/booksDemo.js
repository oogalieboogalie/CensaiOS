// Six months of sample books to explore YorWare Books with, ported from Open
// Books' seed script (MIT). The story: a small design studio that posts on
// social media now and then; each post is followed by a bump in contacts,
// appointments and sales, so the timeline has something to show.
import { SAMPLE_ACCOUNT, SAMPLE_FIELD, eventKey, fileKey, importRowsPatch, metricKey, readBooks, receiptKey, txKey } from './booksModel.js';
import { addEventPatch } from './booksEdits.js';
import { addReceiptPatch, linkReceiptPatch } from './booksReceipts.js';
import { addDays } from './timeline.js';

const POSTS = [
  { offset: 20, kind: 'social_post', title: 'Instagram reel: before and after brand refresh', url: 'https://instagram.com/p/demo1' },
  { offset: 55, kind: 'email', title: 'Newsletter: spring availability', url: '' },
  { offset: 90, kind: 'social_post', title: 'TikTok: logo design time-lapse', url: 'https://tiktok.com/@demo/video/2' },
  { offset: 118, kind: 'promotion', title: 'Summer bundle, 15% off brand kits', url: '' },
  { offset: 150, kind: 'social_post', title: 'LinkedIn post: client case study', url: 'https://linkedin.com/posts/demo3' },
  { offset: 172, kind: 'ad', title: 'Meta ads test, $150 budget', url: '' },
];

const EMAILED = [
  { match: 'ADOBE', vendor: 'Adobe', subject: 'Your Adobe invoice' },
  { match: 'GOOGLE', vendor: 'Google Workspace', subject: 'Google Workspace: Your invoice is available' },
  { match: 'WEWORK', vendor: 'WeWork', subject: 'Your WeWork receipt' },
  { match: 'AMZN', vendor: 'Amazon.com', subject: 'Your Amazon.com order' },
];

/** A patch that fills an empty Books window with sample data ending `today`. */
export function demoBooksPatch(win, today) {
  let seed = 42;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const between = (lo, hi) => Math.round(lo + rand() * (hi - lo));
  const start = addDays(today, -182);
  const boost = (day) => POSTS.reduce((b, p) => (day >= p.offset && day < p.offset + 10 ? b + (10 - (day - p.offset)) / 10 : b), 0);
  const rows = [];
  const patch = {};
  for (let d = 0; d <= 182; d += 1) {
    const date = addDays(start, d);
    const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
    const weekday = dow > 0 && dow < 6;
    const b = boost(d);
    const sales = (weekday && rand() < 0.3 ? 1 : 0) + (rand() < b * 0.6 ? between(1, 2) : 0);
    for (let i = 0; i < sales; i += 1) rows.push({ date, description: rand() < 0.7 ? 'STRIPE TRANSFER' : 'SQUARE INC', amountCents: between(150, 1800) * 100 });
    patch[metricKey(date, 'contacts')] = between(0, 2) + Math.round(b * between(2, 6));
    if (weekday) patch[metricKey(date, 'appointments')] = (rand() < 0.35 ? 1 : 0) + Math.round(b * between(0, 3));
    if (date.endsWith('-03')) rows.push({ date, description: 'ADOBE *CREATIVE CLD', amountCents: -5999 });
    if (date.endsWith('-05')) rows.push({ date, description: 'GOOGLE *GSUITE_STUDIO', amountCents: -1440 });
    if (date.endsWith('-01')) rows.push({ date, description: 'WEWORK MEMBERSHIP', amountCents: -45000 });
    if (date.endsWith('-14')) rows.push({ date, description: 'COMCAST CABLE COMM', amountCents: -8999 });
    if (date.endsWith('-28')) rows.push({ date, description: 'MONTHLY SERVICE FEE', amountCents: -1500 });
    if (weekday && rand() < 0.15) rows.push({ date, description: 'STARBUCKS STORE #08812', amountCents: -between(5, 14) * 100 });
    if (rand() < 0.05) rows.push({ date, description: 'SHELL OIL 57444', amountCents: -between(35, 60) * 100 });
    if (rand() < 0.04) rows.push({ date, description: 'UPWORK -REF', amountCents: -between(200, 700) * 100 });
    if (rand() < 0.03) rows.push({ date, description: 'AMZN MKTP US', amountCents: -between(15, 90) * 100 });
  }
  for (const p of POSTS.filter((x) => x.kind === 'ad')) rows.push({ date: addDays(start, p.offset), description: 'FACEBK *ADS', amountCents: -15000 });

  // Never write over a number someone already logged.
  for (const k of Object.keys(patch)) if (win[k] !== undefined && win[k] !== null) delete patch[k];
  const metricKeys = Object.keys(patch);
  patch[`ba.${SAMPLE_ACCOUNT}`] = { name: 'Sample studio (not real)', type: 'checking', at: 1 };
  const imported = importRowsPatch(readBooks({ ...win, ...patch }), SAMPLE_ACCOUNT, rows);
  Object.assign(patch, imported.patch);
  for (const p of POSTS) {
    for (const [k, v] of Object.entries(addEventPatch({ date: addDays(start, p.offset), kind: p.kind, title: p.title, url: p.url }))) patch[k] = { ...v, sample: true };
  }

  // Receipts that matched their charges, and one still waiting for its charge.
  const books = readBooks({ ...win, ...patch });
  const recent = books.transactions.filter((t) => t.date >= addDays(today, -40));
  for (const r of EMAILED) {
    const t = recent.find((x) => x.description.startsWith(r.match));
    if (!t) continue;
    const added = addReceiptPatch(books, { vendor: r.vendor, date: t.date, amountCents: -t.amountCents, source: 'sample' });
    Object.assign(patch, linkReceiptPatch(added.receipt, t.id, 'auto'));
  }
  const waiting = addReceiptPatch(books, { vendor: 'Blick Art Materials', date: addDays(today, -1), amountCents: 4217, orderRef: 'B7731920', source: 'sample' });
  Object.assign(patch, waiting.patch);
  // Daily numbers are plain values, so remember which ones the sample wrote.
  patch[SAMPLE_FIELD] = { metrics: metricKeys, at: Date.now() };
  return patch;
}

/** Takes the sample books back out, leaving everything real. */
export function removeSamplePatch(win) {
  const books = readBooks(win);
  const patch = { [`ba.${SAMPLE_ACCOUNT}`]: null, [SAMPLE_FIELD]: null };
  for (const t of books.transactions) if (t.accountId === SAMPLE_ACCOUNT) patch[txKey(t.id)] = null;
  for (const e of books.events) if (e.sample) patch[eventKey(e.id)] = null;
  for (const r of books.receipts) if (r.source === 'sample') { patch[receiptKey(r.id)] = null; patch[fileKey(r.id)] = null; }
  for (const k of win[SAMPLE_FIELD]?.metrics || []) if (typeof k === 'string' && k.startsWith('bm.')) patch[k] = null;
  return patch;
}
