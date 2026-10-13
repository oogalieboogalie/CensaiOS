// Plain-markdown export of one hunted lead, for "Copy all" and for opening
// the outreach as a Document window on the canvas.

const CHANNEL_LABEL = { email: 'Email', linkedin: 'LinkedIn', call: 'Call', video: 'Video', 'value-drop': 'Value drop' };

export const channelLabel = (channel = '') => CHANNEL_LABEL[channel] || (channel ? channel[0].toUpperCase() + channel.slice(1) : 'Touch');

export function slugify(text = '') {
  return String(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'lead';
}

export function touchText(touch = {}) {
  return [touch.subject && `Subject: ${touch.subject}`, touch.body].filter(Boolean).join('\n\n');
}

export function leadToMarkdown(lead = {}, brief = {}) {
  const contacts = lead.contacts || {};
  const reach = [
    ...(contacts.emails || []), ...(contacts.phones || []),
    ...['linkedin', 'facebook', 'instagram'].map((k) => contacts[k]).filter(Boolean),
  ];
  const lines = [`# ${lead.company || 'Lead'}: introduction plan`, ''];
  if (lead.url) lines.push(`Website: ${lead.url}`);
  if (Number.isFinite(Number(lead.fitScore))) lines.push(`Fit: ${lead.fitScore} of 100`);
  if (lead.decision_maker) lines.push(`Reach: ${lead.decision_maker}`);
  if (reach.length) lines.push(`Contact: ${reach.join(' · ')}`);
  if (brief.business) lines.push(`Seller: ${brief.business}`);
  lines.push('');
  if (lead.why_fit) lines.push('## Why this one', '', lead.why_fit, '');
  if (lead.angle) lines.push(`**Opening angle:** ${lead.angle}`, '');

  const sequence = lead.sequence || [];
  if (sequence.length) {
    lines.push('## 7-day introduction sequence', '');
    for (const touch of sequence) {
      lines.push(`### Day ${touch.day} · ${channelLabel(touch.channel)}${touch.subject ? `: ${touch.subject}` : ''}`, '', touch.body || '', '');
    }
  }
  const ib = lead.iceBreaker;
  if (ib) {
    lines.push(`## Ice breaker: ${ib.title || 'deliverable'}${ib.format ? ` (${ib.format})` : ''}`, '');
    if (ib.opening_line) lines.push(`> ${ib.opening_line}`, '');
    // Nest the deliverable's own headings under the ice breaker heading.
    if (ib.deliverable) lines.push(ib.deliverable.replace(/^(#{1,5}) /gm, '#$1 '), '');
    if (ib.cta) lines.push(`**Ask:** ${ib.cta}`, '');
  }
  return `${lines.join('\n').trim()}\n`;
}
