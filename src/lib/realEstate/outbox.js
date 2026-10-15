// Spec 7: the Outbox. Agents on a Real Estate Team board can only draft
// client messages; a draft leaves the board only when a person approves it
// here. Pure helpers so the window and the tests share them.

export const OUTBOX_SECTIONS = Object.freeze([
  { status: 'pending', label: 'Waiting for approval' },
  { status: 'approved', label: 'Approved' },
  { status: 'discarded', label: 'Discarded' },
]);

/** A mailto: or sms: link that opens the person's own mail or messages app. */
export function sendLink(draft) {
  const body = String(draft?.body || '');
  if (draft?.channel === 'text') {
    const phone = String(draft?.address || '').replace(/[^0-9+]/g, '');
    return `sms:${phone}?&body=${encodeURIComponent(body)}`;
  }
  const to = String(draft?.address || '').trim();
  const params = [];
  if (draft?.subject) params.push(`subject=${encodeURIComponent(draft.subject)}`);
  params.push(`body=${encodeURIComponent(body)}`);
  return `mailto:${encodeURIComponent(to).replace(/%40/g, '@')}?${params.join('&')}`;
}

export function patchDraft(drafts, id, patch) {
  return (Array.isArray(drafts) ? drafts : []).map(draft => (draft.id === id ? { ...draft, ...patch } : draft));
}

export function draftsByStatus(drafts) {
  const list = Array.isArray(drafts) ? drafts : [];
  return Object.fromEntries(OUTBOX_SECTIONS.map(section => [
    section.status,
    list.filter(draft => (draft.status || 'pending') === section.status)
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))),
  ]));
}
