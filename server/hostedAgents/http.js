// One way to talk to every vendor: JSON in, JSON out, a time limit, and
// errors in plain words that never carry the key or the vendor's raw body.
// Every address is checked by netGuard.js before the request goes out, and
// where private addresses are refused the connection is pinned to the
// address that was checked.

import { netFetch } from '../security/publicAddress.js';
import { HostedAgentError } from './errors.js';
import { vendorAddress } from './netGuard.js';

export { HostedAgentError };

const DEFAULT_TIMEOUT_MS = 120_000;

function limitSignal(signal, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  timer.unref?.();
  const abort = () => controller.abort();
  if (signal?.aborted) abort();
  signal?.addEventListener?.('abort', abort, { once: true });
  return { signal: controller.signal, done: () => { clearTimeout(timer); signal?.removeEventListener?.('abort', abort); } };
}

function refusal(res, label) {
  if (res.status === 401 || res.status === 403) {
    return new HostedAgentError(`${label} refused the key. Check it in Settings → Vault, and that it belongs to the account that owns this agent.`, 401, 'HOSTED_AGENT_KEY_REFUSED');
  }
  if (res.status === 404) {
    return new HostedAgentError(`${label} could not find that agent. Check the id you pasted.`, 404, 'HOSTED_AGENT_NOT_FOUND');
  }
  if (res.status === 429) {
    return new HostedAgentError(`${label} says too many requests or no credit left on that key.`, 429, 'HOSTED_AGENT_RATE_LIMITED');
  }
  if (res.status === 400 || res.status === 422) {
    return new HostedAgentError(`${label} did not accept the request (${res.status}). Check the id you pasted.`, 400, 'HOSTED_AGENT_REJECTED');
  }
  return new HostedAgentError(`${label} answered ${res.status}.`, 502, 'HOSTED_AGENT_VENDOR_ERROR');
}

/**
 * Send one request. Returns { res, done } once the vendor said yes; call
 * done() after reading the body (it clears the time limit).
 */
export async function vendorFetch({
  url, method = 'GET', headers = {}, body, label, fetchImpl = netFetch, signal = null, timeoutMs = DEFAULT_TIMEOUT_MS, accept = 'application/json',
}) {
  const { addresses } = await vendorAddress(url, { label });
  const limit = limitSignal(signal, timeoutMs);
  const done = limit.done;
  let res;
  try {
    res = await fetchImpl(url, {
      method,
      // Pinned to the checked address where private ones are refused; no redirect is followed there.
      ...(addresses ? { redirect: 'manual', pinnedAddresses: addresses } : {}),
      headers: { Accept: accept, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers },
      body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)),
      signal: limit.signal,
    });
  } catch (err) {
    done();
    throw failure(err, signal, label);
  }
  if (!res.ok) {
    done();
    await res.body?.cancel?.().catch(() => {});
    throw refusal(res, label);
  }
  return { res, done, signal: limit.signal };
}

function failure(err, signal, label) {
  if (signal?.aborted) return Object.assign(new Error('Stopped.'), { code: 'CHAT_ABORTED' });
  if (err instanceof HostedAgentError) return err;
  if (err?.name === 'AbortError') return new HostedAgentError(`${label} took too long to answer.`, 504, 'HOSTED_AGENT_TIMEOUT');
  return new HostedAgentError(`Could not reach ${label}. Check the internet connection.`, 502, 'HOSTED_AGENT_UNREACHABLE');
}

/** Send one request and read the JSON answer ({} for an empty body). */
export async function vendorJson(opts) {
  const { res, done } = await vendorFetch(opts);
  let text;
  try {
    text = await res.text();
  } catch (err) {
    throw failure(err, opts.signal, opts.label);
  } finally {
    done();
  }
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new HostedAgentError(`${opts.label} sent an answer censaiOS could not read.`, 502, 'HOSTED_AGENT_BAD_ANSWER');
  }
}

/**
 * Read a server-sent event stream. `onEvent(json)` is called for every
 * `data:` line that holds JSON; return true from it to stop reading.
 */
export async function readSse(res, onEvent, { label, signal = null } = {}) {
  const reader = res.body?.getReader?.();
  if (!reader) throw new HostedAgentError(`${label} sent no answer stream.`, 502, 'HOSTED_AGENT_BAD_ANSWER');
  const decoder = new TextDecoder();
  let buffer = '';
  const handle = (block) => {
    const data = block.split(/\r?\n/).filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trimStart()).join('\n');
    if (!data || data === '[DONE]') return false;
    let json;
    try { json = JSON.parse(data); } catch { return false; }
    return Boolean(onEvent(json));
  };
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split(/\r?\n\r?\n/);
      buffer = blocks.pop();
      for (const block of blocks) if (handle(block)) return;
    }
    if (buffer.trim()) handle(buffer);
  } catch (err) {
    throw failure(err, signal, label);
  } finally {
    reader.cancel?.().catch?.(() => {});
  }
}

/** Joins the text parts of a vendor reply ("content" arrays in several shapes). */
export function joinText(parts) {
  if (typeof parts === 'string') return parts;
  if (!Array.isArray(parts)) return '';
  return parts
    .map((part) => (typeof part === 'string' ? part : (part?.type === 'text' || part?.type === 'output_text' || !part?.type) ? part?.text || '' : ''))
    .filter(Boolean)
    .join('\n');
}
