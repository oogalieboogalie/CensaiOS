// Spec 7: the Listing Writer. A short form (address, beds, baths, square
// feet, price, features, photos) becomes an MLS description, a social post
// and an email blast in one model call on the Listing Writer agent's own
// model (a local Ollama model when the board was set up that way), then
// every piece goes through the fair-housing word check.

import { callModel, createModelAccessContext, workspaceUsageSink } from '../aiGateway/index.js';
import { getSubAgentById } from '../memory.js';
import { parseJsonBlock } from '../leadhound/prompts.js';
import { checkFairHousing } from '../../src/lib/realEstate/fairHousing.js';
import { REAL_ESTATE_AGENTS } from '../templates/realEstate/agents.js';

const LISTING_WRITER = REAL_ESTATE_AGENTS.find(agent => agent.key === 'listingWriter');

function text(value, max) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

/** Clean the form. Throws a 400 when the address is missing. */
export function normalizeListingInput(raw = {}) {
  const listing = {
    address: text(raw.address, 160),
    city: text(raw.city, 80),
    beds: text(raw.beds, 8),
    baths: text(raw.baths, 8),
    sqft: text(raw.sqft, 12),
    price: text(raw.price, 20),
    features: text(raw.features, 1500),
    photos: (Array.isArray(raw.photos) ? raw.photos : []).map(photo => text(photo?.caption || photo?.name || photo, 120)).filter(Boolean).slice(0, 12),
  };
  if (!listing.address) {
    throw Object.assign(new Error('Add the property address first.'), { statusCode: 400, code: 'LISTING_ADDRESS_REQUIRED' });
  }
  return listing;
}

export function listingMessages(listing) {
  const facts = [
    `Address: ${listing.address}${listing.city ? `, ${listing.city}` : ''}`,
    listing.beds && `Bedrooms: ${listing.beds}`,
    listing.baths && `Bathrooms: ${listing.baths}`,
    listing.sqft && `Square feet: ${listing.sqft}`,
    listing.price && `List price: ${listing.price}`,
    listing.features && `Features (from the agent): ${listing.features}`,
    listing.photos.length && `Photos: ${listing.photos.join('; ')}`,
  ].filter(Boolean).join('\n');
  return [
    { role: 'system', content: LISTING_WRITER.prompt },
    {
      role: 'user',
      content: `${facts}\n\nWrite three pieces for this listing and answer with JSON only, no prose around it:\n{"description": "MLS description, 150 to 250 words, plain paragraphs", "social": "social post under 60 words, no hashtags spam (two at most)", "email_subject": "email subject line", "email_body": "email blast to our buyer list, under 150 words"}\nUse only the facts above. Describe the property, never the kind of person or household who should live there.`,
    },
  ];
}

/** Model reply -> the four strings, falling back to the raw text as the description. */
export function parseListingReply(reply) {
  const parsed = parseJsonBlock(reply) || {};
  const pick = (...keys) => keys.map(key => parsed[key]).find(value => typeof value === 'string' && value.trim()) || '';
  const draft = {
    description: pick('description', 'mls', 'listing').trim(),
    social: pick('social', 'social_post', 'socialPost').trim(),
    emailSubject: pick('email_subject', 'emailSubject', 'subject').trim(),
    emailBody: pick('email_body', 'emailBody', 'email').trim(),
  };
  if (!draft.description && !draft.social && !draft.emailBody) draft.description = String(reply || '').trim();
  return draft;
}

export function checkListingDraft(draft) {
  const parts = {
    description: checkFairHousing(draft.description),
    social: checkFairHousing(draft.social),
    email: checkFairHousing(`${draft.emailSubject}\n${draft.emailBody}`),
  };
  return {
    ok: Object.values(parts).every(part => part.ok),
    flags: Object.fromEntries(Object.entries(parts).map(([key, part]) => [key, part.flags])),
  };
}

/** The doc the draft lands in: three sections and the check's findings. */
export function listingDocText(listing, draft, check) {
  const lines = [`# ${listing.address}`, ''];
  lines.push('## Description', '', draft.description || '(empty)', '');
  lines.push('## Social post', '', draft.social || '(empty)', '');
  lines.push('## Email blast', '', `Subject: ${draft.emailSubject || '(none)'}`, '', draft.emailBody || '(empty)', '');
  const all = Object.entries(check.flags).flatMap(([part, flags]) => flags.map(flag => ({ part, ...flag })));
  lines.push('## Fair-housing check', '');
  if (!all.length) lines.push('No risky words found.');
  else all.forEach(flag => lines.push(`- ${flag.severity === 'risk' ? 'Rewrite' : 'Review'} "${flag.term}" (${flag.part}): ${flag.reason} ${flag.suggestion}`));
  return lines.join('\n');
}

export async function draftListing({ scope, agentId, listing: rawListing, complete = null }) {
  const listing = normalizeListingInput(rawListing);
  let reply;
  if (complete) {
    reply = await complete(listingMessages(listing));
  } else {
    const sub = agentId ? await getSubAgentById(String(agentId), scope).catch(() => null) : null;
    const source = 'listing-writer';
    const data = await callModel({
      modelProvider: sub?.model_provider || null,
      modelName: sub?.model_name || null,
      accessContext: createModelAccessContext({ userId: scope.userId, workspaceId: scope.workspaceId, source }),
      body: { messages: listingMessages(listing), max_tokens: 1400, temperature: 0.5 },
      timeoutMs: 120000,
      logContext: { source },
      usageAttribution: { workspaceId: scope.workspaceId, actor: { kind: 'user', id: scope.userId }, source },
      usageSink: workspaceUsageSink,
    });
    reply = data?.choices?.[0]?.message?.content || '';
  }
  const draft = parseListingReply(reply);
  const check = checkListingDraft(draft);
  return { listing, draft, check, docText: listingDocText(listing, draft, check) };
}
