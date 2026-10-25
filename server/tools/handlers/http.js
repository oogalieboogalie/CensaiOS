import { lookup } from 'node:dns/promises';
import { createLogger } from '../../logger.js';
import { getRuntimeMode, RUNTIME_MODES } from '../../middleware/runtimeMode.js';
import { pinnedFetch, privateAddressesAllowed, vetHost } from '../../security/publicAddress.js';
import { assertSystemAdmin } from '../../security/systemAdmin.js';
import { addressKind } from '../../security/addressKind.js';

const log = createLogger('tools');

// HTTP Test may reach this computer and its home or office network only when
// this run allows private addresses (server/security/publicAddress.js) and the
// computer's owner is the one driving the agent (or the desktop app itself,
// with nobody behind the call). Anyone else's agent gets public addresses
// only, pinned to the address checked and with no redirects followed.
async function ownerDriving(context = {}) {
  const userId = Number(context.userId);
  if (!Number.isInteger(userId) || userId <= 0) {
    return context.userId == null && getRuntimeMode() === RUNTIME_MODES.LOCAL_DESKTOP;
  }
  return assertSystemAdmin({ session: { userId } }).then(() => true, () => false);
}

/** { fetcher } to call the address with, or { refusal } text for the agent. */
async function reachFor(rawUrl, context, { resolve = lookup, isOwner = ownerDriving } = {}) {
  let url;
  try { url = new URL(String(rawUrl)); } catch { return { refusal: `http_test error: ${rawUrl} is not a web address.` }; }
  if (!['http:', 'https:'].includes(url.protocol)) return { refusal: 'http_test only calls http:// or https:// addresses.' };
  if (privateAddressesAllowed() && await isOwner(context)) return { fetcher: globalThis.fetch };
  const { addresses, missing, blocked } = await vetHost(url.hostname, { resolve });
  if (missing) return { refusal: `http_test error: could not find ${url.hostname} on the internet.` };
  if (blocked) {
    log.warn('http_test refused: private network', { kind: addressKind(blocked), userId: Number(context.userId) > 0 ? Number(context.userId) : null });
    return {
      refusal: `http_test did not call ${url.hostname}: that address is inside this computer or a private network. `
        + "Only this computer's owner can test those; other agents can test public web addresses.",
    };
  }
  return { fetcher: pinnedFetch(addresses) };
}

export async function handleHttpTool(agentId, name, args, context = {}, deps = {}) {
  switch (name) {
    case 'http_test': {
      if (!args.url) return 'http_test requires args.url to be set.';
      const { fetcher, refusal } = await reachFor(args.url, context, deps);
      if (refusal) return refusal;

      const method = (args.method || 'GET').toUpperCase();
      const timeoutMs = args.timeout_ms || 5000;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const fetchOptions = {
        method,
        signal: controller.signal,
        headers: args.headers || {},
      };
      if (args.body && method !== 'GET' && method !== 'HEAD') {
        fetchOptions.body = args.body;
      }

      const startTime = Date.now();

      try {
        const response = await fetcher(args.url, fetchOptions);
        clearTimeout(timeoutId);
        const latencyMs = Date.now() - startTime;

        const bodyText = await response.text().catch(() => '(could not read body)');
        const truncatedBody = bodyText.length > 2000 ? bodyText.slice(0, 2000) + '\n... [truncated]' : bodyText;

        const statusMatch = args.expected_status != null
          ? `\nExpected Status: ${args.expected_status} → ${response.status === args.expected_status ? '✓ MATCH' : `✗ MISMATCH (got ${response.status})`}`
          : '';

        const headersOut = [...response.headers.entries()]
          .map(([k, v]) => `  ${k}: ${v}`)
          .join('\n');

        return [
          `URL:        ${args.url}`,
          `Method:     ${method}`,
          `Status:     ${response.status} ${response.statusText}`,
          `Latency:    ${latencyMs}ms`,
          statusMatch,
          `\nRESPONSE HEADERS\n${headersOut || '  (none)'}`,
          `\nBODY (first 2000 chars)\n${truncatedBody || '(empty body)'}`,
        ].filter(Boolean).join('\n');

      } catch (err) {
        clearTimeout(timeoutId);
        if (err.name === 'AbortError') {
          return `http_test timeout: No response from ${args.url} within ${timeoutMs}ms.`;
        }
        return `http_test error for ${args.url}: ${err.message}`;
      }
    }

    default:
      throw new Error(`Unknown http tool: ${name}`);
  }
}
