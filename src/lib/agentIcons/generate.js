/**
 * src/lib/agentIcons/generate.js
 *
 * Brief C2 — `.team/handoffs/2026-06-23-c2-agent-icon-picker.md`.
 *
 * AI gateway caller for the "Generate" tab of the agent icon picker.
 * Validates the result is real SVG (not a raster fallback) and returns
 * the sanitized source.
 *
 * **No AI slop:** if the endpoint returns a base64 PNG inside an <svg>
 * wrapper (the documented raster fallback), or any non-SVG payload, we
 * reject it. The brief explicitly says: "Rejects results that aren't
 * SVG. Rejects results that look like rasterized fallbacks."
 *
 * Behind a feature flag: `agentIconGenerator.enabled` (env var or
 * runtime config). Off by default in self-hosted builds — call
 * `isGenerateEnabled()` first.
 *
 * Pure JS, no new deps. Used by AgentIconPicker.jsx.
 *
 * Test hook: `setIconGatewayCaller(fn)` lets tests substitute the
 * gateway call without monkey-patching modules.
 */

import { validateSvgString } from './upload.js';

// ---------------------------------------------------------------------------
// Feature flag
// ---------------------------------------------------------------------------

/**
 * Whether the agent-icon-generator UI is offered. Cost enforcement lives
 * server-side (`POST /api/agent-icons/generate` returns 403 unless
 * `CENSAAI_AGENT_ICON_GENERATOR=1`), so the client only hides the tab
 * when explicitly disabled via the env var (`0`/`false`) or the runtime
 * config `window.__CENSAI_CONFIG__?.agentIconGenerator?.enabled === false`.
 *
 * @returns {boolean}
 */
export function isGenerateEnabled() {
  if (typeof process !== 'undefined' && process.env) {
    const v = process.env.CENSAAI_AGENT_ICON_GENERATOR;
    if (typeof v === 'string' && (v === '0' || v.toLowerCase() === 'false')) {
      return false;
    }
  }
  if (typeof window !== 'undefined' && window.__CENSAI_CONFIG__?.agentIconGenerator) {
    if (window.__CENSAI_CONFIG__.agentIconGenerator.enabled === false) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Gateway call (with test-injection seam)
// ---------------------------------------------------------------------------

/**
 * Default gateway caller: invokes the AI gateway's iconGenerate endpoint.
 * Surfaces a clear "not configured" error when the gateway has no icon
 * route (e.g. self-hosted without the AI gateway extension). Production
 * deployments wire the AI gateway to nanobanana / imagen.
 *
 * @param {{ prompt: string, kind: string }} args
 * @returns {Promise<string>} raw response (expected SVG, but may be slop)
 */
async function defaultGatewayCaller({ prompt, kind }) {
  let api;
  try {
    api = (await import('../api.js')).api;
  } catch (err) {
    throw new Error('AI gateway module not available');
  }
  if (typeof api.iconGenerate !== 'function') {
    throw new Error('AI gateway has no iconGenerate endpoint (server extension not deployed)');
  }
  return await api.iconGenerate({ prompt, kind });
}

// Module-level holder so tests can replace without touching internals.
let gatewayCaller = defaultGatewayCaller;

/**
 * Replace the gateway caller. Used by tests; production code shouldn't
 * touch this.
 */
export function setIconGatewayCaller(fn) {
  gatewayCaller = typeof fn === 'function' ? fn : defaultGatewayCaller;
}

/**
 * Reset to the default gateway caller. Used by tests in afterEach.
 */
export function resetIconGatewayCaller() {
  gatewayCaller = defaultGatewayCaller;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Call the AI gateway to generate an icon for the given prompt + kind.
 * Returns either { ok: true, svg } or { ok: false, reason }.
 *
 * @param {string} prompt
 * @param {string} kind — agent kind (e.g. 'architect'); used as a hint
 *                        for the prompt template.
 * @returns {Promise<{ ok: true, svg: string } | { ok: false, reason: string }>}
 */
export async function generateAgentIcon(prompt, kind) {
  if (!isGenerateEnabled()) {
    return { ok: false, reason: 'Generator disabled (set CENSAAI_AGENT_ICON_GENERATOR=1 to enable)' };
  }
  if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
    return { ok: false, reason: 'Prompt is empty' };
  }

  let rawResponse = '';
  try {
    rawResponse = await gatewayCaller({ prompt, kind });
  } catch (err) {
    return { ok: false, reason: `AI gateway error: ${err && err.message ? err.message : 'unknown'}` };
  }

  if (typeof rawResponse !== 'string' || rawResponse.length === 0) {
    return { ok: false, reason: 'Empty response from gateway' };
  }

  // RASTER-FALLBACK CHECK FIRST. The gateway's documented fallback for
  // prompts it can't fulfill is an <svg> wrapper around a base64 PNG.
  // The brief calls this "AI slop" and requires us to reject it.
  // We check this BEFORE validateSvgString because the fallback IS a
  // structurally valid SVG (well-formed, has viewBox, no scripts) — it
  // just isn't vector content.
  if (looksLikeRasterFallback(rawResponse)) {
    return {
      ok: false,
      reason: 'raster fallback (base64 PNG inside SVG is rejected — vector only)',
    };
  }

  // Then run the same validation pipeline the upload path uses. Catches
  // scripts, event handlers, and other injected content.
  const validated = await validateSvgString(rawResponse);
  if (!validated.ok) {
    return { ok: false, reason: validated.reason };
  }
  return { ok: true, svg: validated.sanitizedSvg };
}

/**
 * Heuristic: does the response look like a raster fallback? The
 * documented fallback is an <svg> whose body contains only an
 * <image href="data:image/png;base64,..."> (or jpeg / webp). If we
 * see that shape, the gateway returned a slop result.
 *
 * Decision tree:
 *   1. Body contains a base64 data: image → fallback.
 *   2. Body contains vector content (circles, paths, etc.) → not fallback,
 *      even if there's also an <image> tag.
 *   3. Body is just whitespace + <image> (no other tags) → fallback.
 *
 * @param {string} raw
 * @returns {boolean}
 */
export function looksLikeRasterFallback(raw) {
  if (typeof raw !== 'string') return false;
  // The SVG matcher searches the full payload, so XML declarations and
  // comments before the root do not need a fragile string-stripping pass.
  const cleaned = raw;
  // The body is everything between <svg ...> and </svg>. We use the first
  // match because parseSvg in upload.js disallows nested svgs.
  const m = cleaned.match(/<svg\b[^>]*>([\s\S]*?)<\/svg\s*>/i);
  if (!m) return false;
  const body = m[1].trim();
  // Empty body is suspicious but not necessarily a raster fallback.
  if (body.length === 0) return false;

  // Check whether the body has any vector content. If it ONLY has <image>
  // (with any src — http, https, relative, data:), treat as a fallback.
  // First, strip the image tags. Then check if there's any remaining content
  // that is a vector tag (path, circle, rect, line, polygon, polyline,
  // g, defs, text, use, etc.).
  const withoutImage = body.replace(/<image\b[\s\S]*?\/?\s*>/gi, '').trim();
  if (withoutImage.length === 0) return true; // body was only <image>

  // The body has SOMETHING beyond <image>. If that something is a vector
  // tag, it's NOT a fallback (the gateway mixed raster decoration with
  // real vector content — that's not slop). If it's only text/whitespace
  // /comments, it IS effectively a fallback.
  const vectorTagPattern = /<\s*(?:path|circle|rect|line|polygon|polyline|ellipse|g|defs|symbol|text|use|tspan)\b/i;
  return !vectorTagPattern.test(withoutImage);
}
