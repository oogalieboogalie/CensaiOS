// Agent icon registry — single source of truth for vector icons.
//
// Each entry is the raw SVG markup of a hand-designed vector (no AI slop —
// each shape carries meaning, see src/assets/agent-icons/<slug>.svg for the
// intent of every glyph). The registry exports:
//
//   AGENT_ICONS     — 7 family agents keyed by agent id (architect, atlas, …)
//   STOCK_ICONS     — 12 stock primitives keyed by id (circle, triangle, …)
//   resolveIcon(ref) — accept an agentId, an iconRef like "stock:circle",
//                       or an { agent } object; return the SVG markup or null
//   listAgentIcons / listStockIcons — for the future icon picker (C2)
//
// All icons share the contract:
//   * viewBox="0 0 64 64"
//   * no width / height attributes on the root <svg> (CSS sizes them)
//   * stroke uses currentColor so the icon adopts theme tokens
//   * parseable SVG (validated at module load)
//
// Adding a new family icon: drop <name>.svg into src/assets/agent-icons/,
// add an import + entry below. Adding a stock icon: same, in stock/.
//
// Module-load validation runs once at import time and throws if a file is
// missing the viewBox, contains a width/height attr, or fails to parse —
// this is intentional, so a broken icon never silently ships.
//
// The `?raw` import suffix is Vite-native (returns the file as a string);
// Jest handles it via the moduleNameMapper in jest.config.cjs.

import architectSvg from '../../assets/agent-icons/architect.svg?raw';
import atlasSvg from '../../assets/agent-icons/atlas.svg?raw';
import genesisSvg from '../../assets/agent-icons/genesis.svg?raw';
import nexusSvg from '../../assets/agent-icons/nexus.svg?raw';
import foundationSvg from '../../assets/agent-icons/foundation.svg?raw';
import echoSvg from '../../assets/agent-icons/echo.svg?raw';
import censaiSvg from '../../assets/agent-icons/censai.svg?raw';
import phoenixSvg from '../../assets/agent-icons/phoenix.svg?raw';

import circleSvg from '../../assets/agent-icons/stock/circle.svg?raw';
import triangleSvg from '../../assets/agent-icons/stock/triangle.svg?raw';
import squareSvg from '../../assets/agent-icons/stock/square.svg?raw';
import hexSvg from '../../assets/agent-icons/stock/hex.svg?raw';
import pentagonSvg from '../../assets/agent-icons/stock/pentagon.svg?raw';
import octagonSvg from '../../assets/agent-icons/stock/octagon.svg?raw';
import diamondSvg from '../../assets/agent-icons/stock/diamond.svg?raw';
import crossSvg from '../../assets/agent-icons/stock/cross.svg?raw';
import spiralSvg from '../../assets/agent-icons/stock/spiral.svg?raw';
import waveSvg from '../../assets/agent-icons/stock/wave.svg?raw';
import gridSvg from '../../assets/agent-icons/stock/grid.svg?raw';
import orbitSvg from '../../assets/agent-icons/stock/orbit.svg?raw';

const EXPECTED_VIEWBOX = '0 0 64 64';

/**
 * Validate one SVG payload at module load.
 * Throws if the file is not parseable, has the wrong viewBox, or has a
 * width/height attribute on the root <svg> (we want CSS to size it).
 * Returns a frozen, trimmed copy of the markup so callers can't mutate it.
 */
function validateIcon(id, source, kind) {
  if (typeof source !== 'string' || source.trim().length === 0) {
    throw new Error(`[agentIcons] ${kind} icon "${id}" is empty or missing`);
  }
  const trimmed = source.trim();
  // Cheap parse: extract the first <svg ...> opening tag.
  const openMatch = trimmed.match(/<svg\b([^>]*)>/i);
  if (!openMatch) {
    throw new Error(`[agentIcons] ${kind} icon "${id}" has no <svg> root`);
  }
  const attrs = openMatch[1];
  const viewBoxMatch = attrs.match(/\bviewBox\s*=\s*["']([^"']+)["']/i);
  if (!viewBoxMatch || viewBoxMatch[1].trim() !== EXPECTED_VIEWBOX) {
    throw new Error(
      `[agentIcons] ${kind} icon "${id}" viewBox must be "${EXPECTED_VIEWBOX}" (got "${
        viewBoxMatch ? viewBoxMatch[1] : 'none'
      }")`,
    );
  }
  if (/(?:^|\s)width\s*=/.test(attrs) || /(?:^|\s)height\s*=/.test(attrs)) {
    throw new Error(
      `[agentIcons] ${kind} icon "${id}" must not declare width/height on the root <svg>`,
    );
  }
  // Closing tag — keep the validation strict but tolerant of trailing whitespace.
  if (!/<\/svg>\s*$/.test(trimmed)) {
    throw new Error(`[agentIcons] ${kind} icon "${id}" has no closing </svg>`);
  }
  return Object.freeze(trimmed);
}

/**
 * Build an icon map from a [id, source] tuple list, validating each one.
 * Returns a frozen object so accidental mutation at runtime is loud.
 */
function buildIconMap(kind, entries) {
  const out = {};
  for (const [id, source] of entries) {
    out[id] = {
      id,
      kind,
      // `markup` is the raw SVG body — components inline this via dangerouslySetInnerHTML.
      markup: validateIcon(id, source, kind),
    };
  }
  return Object.freeze(out);
}

const AGENT_ICON_ENTRIES = [
  ['architect',  architectSvg],
  ['atlas',      atlasSvg],
  ['genesis',    genesisSvg],
  ['nexus',      nexusSvg],
  ['foundation', foundationSvg],
  ['echo',       echoSvg],
  ['censai',     censaiSvg],
  ['phoenix',    phoenixSvg],
];

const STOCK_ICON_ENTRIES = [
  ['circle',   circleSvg],
  ['triangle', triangleSvg],
  ['square',   squareSvg],
  ['hex',      hexSvg],
  ['pentagon', pentagonSvg],
  ['octagon',  octagonSvg],
  ['diamond',  diamondSvg],
  ['cross',    crossSvg],
  ['spiral',   spiralSvg],
  ['wave',     waveSvg],
  ['grid',     gridSvg],
  ['orbit',    orbitSvg],
];

export const AGENT_ICONS = buildIconMap('agent', AGENT_ICON_ENTRIES);
export const STOCK_ICONS = buildIconMap('stock', STOCK_ICON_ENTRIES);

/**
 * Resolve an icon reference to a registry entry.
 * Accepts, in order of precedence:
 *   - a string like "stock:circle" or "agent:architect" (explicit kind)
 *   - a string that matches an AGENT_ICONS id (e.g. "architect")
 *   - a string that matches a STOCK_ICONS id (e.g. "circle")
 *   - an object { agent: { id, iconRef } } — pulls iconRef first, falls back to id
 * Returns null if nothing matches (caller decides how to fall back).
 */
export function resolveIcon(ref) {
  if (ref == null) return null;

  // Object form: { agent: { id, iconRef } }
  if (typeof ref === 'object') {
    const agent = ref.agent;
    if (!agent) return null;
    if (typeof agent.iconRef === 'string' && agent.iconRef.length > 0) {
      const viaRef = resolveIcon(agent.iconRef);
      if (viaRef) return viaRef;
    }
    return AGENT_ICONS[agent.id] || null;
  }

  if (typeof ref !== 'string' || ref.length === 0) return null;

  // Qualified form: "<kind>:<id>"
  const colonIdx = ref.indexOf(':');
  if (colonIdx > 0) {
    const kind = ref.slice(0, colonIdx);
    const id = ref.slice(colonIdx + 1);
    if (kind === 'agent') return AGENT_ICONS[id] || null;
    if (kind === 'stock') return STOCK_ICONS[id] || null;
    return null;
  }

  // Bare id — prefer agent namespace, then stock.
  return AGENT_ICONS[ref] || STOCK_ICONS[ref] || null;
}

export function listAgentIcons() {
  return Object.values(AGENT_ICONS);
}

export function listStockIcons() {
  return Object.values(STOCK_ICONS);
}

/**
 * Does this agent have a vector icon configured?
 * `true` if the agent id matches AGENT_ICONS OR if it has an explicit iconRef
 * that resolves to either registry. Lets AgentAvatar pick the right render path.
 */
export function hasVectorIcon(agent) {
  if (!agent) return false;
  if (typeof agent.iconRef === 'string' && agent.iconRef.length > 0) {
    return resolveIcon(agent.iconRef) != null;
  }
  return AGENT_ICONS[agent.id] != null;
}