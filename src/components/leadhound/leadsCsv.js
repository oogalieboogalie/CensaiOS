// "Download CSV" on LeadHound's results: the whole hunt as a spreadsheet file
// (one row per lead), built in the browser. Cells are quoted the CSV way, and
// a cell that a spreadsheet would read as a formula (=, +, -, @) gets a
// leading apostrophe so opening the file never runs anything. The app log
// gets one line per download with the count only, never a name or contact.

import { logToApp } from '../../lib/appLog/browserLog.js';
import { slugify } from './exportLead.js';

export const CSV_COLUMNS = ['Name', 'Website', 'Emails', 'Phones', 'LinkedIn', 'Score', 'Why it fits', 'Ice breaker'];

export function csvCell(value) {
  let text = String(value ?? '').replace(/\r\n?/g, '\n');
  if (/^[=+\-@\t]/.test(text)) text = `'${text}`;
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function iceBreakerText(ib) {
  if (!ib) return '';
  return [ib.title, ib.opening_line].filter(Boolean).join(': ');
}

export function leadRow(lead = {}) {
  const contacts = lead.contacts || {};
  const score = Number(lead.fitScore);
  return [
    lead.company || '',
    lead.url || '',
    (contacts.emails || []).join('; '),
    (contacts.phones || []).join('; '),
    contacts.linkedin || '',
    Number.isFinite(score) ? String(score) : '',
    lead.why_fit || lead.angle || '',
    iceBreakerText(lead.iceBreaker),
  ];
}

/** The file's text: a header row, then one row per lead, Windows line ends for Excel. */
export function leadsToCsv(leads = []) {
  const rows = [CSV_COLUMNS, ...leads.map(leadRow)];
  return `${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

export function csvFileName(brief = {}, now = new Date()) {
  const day = now.toISOString().slice(0, 10);
  return `leads-${slugify(brief.market || brief.business || 'hunt')}-${day}.csv`;
}

/** Save the file through a temporary link (with a byte-order mark so Excel reads accents). */
export function downloadLeadsCsv(leads, brief, { doc = document, url = URL } = {}) {
  const blob = new Blob(['\uFEFF', leadsToCsv(leads)], { type: 'text/csv;charset=utf-8' });
  const href = url.createObjectURL(blob);
  const link = doc.createElement('a');
  link.href = href;
  link.download = csvFileName(brief);
  doc.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => url.revokeObjectURL(href), 1000);
  logToApp('info', `leadhound: downloaded ${leads.length} lead${leads.length === 1 ? '' : 's'} as a spreadsheet`, { where: 'leadhound' });
}
