// Every vendor that can host an agent censaiOS talks to, behind one shape:
//
//   id, label, product, brand, keyProvider, keyLabel, billedBy, howTo,
//   refLabel, refPlaceholder, needsEndpoint?, endpointLabel?, canCreate?
//   normalize({ ref, endpoint })  → { ref, endpoint, settings }  (throws 400 on a bad paste)
//   describe({ ref, endpoint, settings, apiKey, fetchImpl }) → { name, description, instructions }
//   send({ ref, endpoint, settings, apiKey, thread, text, fetchImpl, signal }) → { text, thread }
//   create?(...)  ElevenLabs only: make a new agent on the person's account
//
// `thread` is the vendor's own conversation id (a session, thread or
// conversation), remembered per person and chat in hosted_agent_threads.
// Research behind each adapter, with links: docs/hosted-agents.md.

import { anthropicVendor } from './anthropic.js';
import { openaiVendor } from './openai.js';
import { googleVendor } from './google.js';
import { elevenlabsVendor } from './elevenlabs.js';
import { langchainVendor } from './langchain.js';

export const HOSTED_VENDORS = Object.freeze([anthropicVendor, openaiVendor, googleVendor, elevenlabsVendor, langchainVendor]);
const BY_ID = new Map(HOSTED_VENDORS.map((vendor) => [vendor.id, vendor]));

export function getVendor(id) {
  return BY_ID.get(String(id || '').toLowerCase()) || null;
}

const PUBLIC_FIELDS = [
  'id', 'label', 'product', 'brand', 'keyProvider', 'keyLabel', 'billedBy', 'howTo',
  'refLabel', 'refPlaceholder', 'needsEndpoint', 'endpointLabel', 'endpointPlaceholder', 'canCreate',
];

/** What the Import screen needs to draw each vendor. No functions, no secrets. */
export function publicVendors() {
  return HOSTED_VENDORS.map((vendor) => Object.fromEntries(
    PUBLIC_FIELDS.filter((key) => vendor[key] !== undefined).map((key) => [key, vendor[key]]),
  ));
}
