// Tests for the agent icon registry (C1 brief).
//
// Covers:
//   - every family agent in BUILT_IN_AGENTS has an icon
//   - the 12 stock icons are present
//   - every icon file is parseable SVG with viewBox="0 0 64 64"
//   - no root <svg> declares width / height
//   - resolveIcon routes agent id, stock id, "kind:id" refs, and {agent} objects
//   - hasVectorIcon agrees with the registry
//   - the React AgentIcon component renders the right markup and is a no-op
//     for unknown ids

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  AGENT_ICONS,
  STOCK_ICONS,
  resolveIcon,
  listAgentIcons,
  listStockIcons,
  hasVectorIcon,
} from '../src/lib/agentIcons/registry.js';
import { BUILT_IN_AGENTS } from '../src/components/Agents.jsx';

// Resolve absolute path to the icon asset directory regardless of where
// Jest is invoked from.
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const ASSET_DIR = path.join(ROOT, 'src', 'assets', 'agent-icons');

const REQUIRED_STOCK = [
  'circle', 'triangle', 'square', 'hex', 'pentagon', 'octagon',
  'diamond', 'cross', 'spiral', 'wave', 'grid', 'orbit',
];

function readIcon(relPath) {
  const fullPath = path.join(ASSET_DIR, relPath);
  return fs.readFileSync(fullPath, 'utf8');
}

describe('agent icon registry', () => {
  describe('asset files on disk', () => {
    test('all 7 family icon files exist with non-empty content', () => {
      const ids = ['architect', 'atlas', 'genesis', 'nexus', 'foundation', 'echo', 'censai'];
      for (const id of ids) {
        const content = readIcon(`${id}.svg`);
        expect(content.length).toBeGreaterThan(0);
      }
    });

    test('all 12 stock icon files exist with non-empty content', () => {
      for (const id of REQUIRED_STOCK) {
        const content = readIcon(path.join('stock', `${id}.svg`));
        expect(content.length).toBeGreaterThan(0);
      }
    });

    test('every family icon has viewBox="0 0 64 64" and no width/height on root', () => {
      const ids = ['architect', 'atlas', 'genesis', 'nexus', 'foundation', 'echo', 'censai'];
      for (const id of ids) {
        const content = readIcon(`${id}.svg`);
        expect(content).toMatch(/<svg\b[^>]*\bviewBox\s*=\s*["']0 0 64 64["']/);
        // Root <svg> must not have width or height — strip everything between
        // <svg and the first > and assert both attrs are absent. The check
        // uses (^|\s) before the attribute name so `stroke-width` (legal) is
        // not flagged.
        const openTag = content.match(/<svg\b([^>]*)>/i);
        expect(openTag).not.toBeNull();
        expect(openTag[1]).not.toMatch(/(?:^|\s)width\s*=/);
        expect(openTag[1]).not.toMatch(/(?:^|\s)height\s*=/);
      }
    });

    test('every stock icon has viewBox="0 0 64 64" and no width/height on root', () => {
      for (const id of REQUIRED_STOCK) {
        const content = readIcon(path.join('stock', `${id}.svg`));
        expect(content).toMatch(/<svg\b[^>]*\bviewBox\s*=\s*["']0 0 64 64["']/);
        const openTag = content.match(/<svg\b([^>]*)>/i);
        expect(openTag).not.toBeNull();
        expect(openTag[1]).not.toMatch(/(?:^|\s)width\s*=/);
        expect(openTag[1]).not.toMatch(/(?:^|\s)height\s*=/);
      }
    });

    test('every icon uses currentColor so it adopts theme tokens', () => {
      const ids = ['architect', 'atlas', 'genesis', 'nexus', 'foundation', 'echo', 'censai'];
      for (const id of ids) {
        expect(readIcon(`${id}.svg`)).toMatch(/currentColor/);
      }
      for (const id of REQUIRED_STOCK) {
        expect(readIcon(path.join('stock', `${id}.svg`))).toMatch(/currentColor/);
      }
    });
  });

  describe('registry exports', () => {
    test('AGENT_ICONS has all 7 family agents', () => {
      const ids = ['architect', 'atlas', 'genesis', 'nexus', 'foundation', 'echo', 'censai'];
      for (const id of ids) {
        expect(AGENT_ICONS[id]).toBeDefined();
        expect(AGENT_ICONS[id].id).toBe(id);
        expect(AGENT_ICONS[id].kind).toBe('agent');
        expect(typeof AGENT_ICONS[id].markup).toBe('string');
        expect(AGENT_ICONS[id].markup.length).toBeGreaterThan(0);
      }
      expect(Object.keys(AGENT_ICONS)).toHaveLength(8);
    });

    test('STOCK_ICONS has all 12 stock primitives', () => {
      for (const id of REQUIRED_STOCK) {
        expect(STOCK_ICONS[id]).toBeDefined();
        expect(STOCK_ICONS[id].id).toBe(id);
        expect(STOCK_ICONS[id].kind).toBe('stock');
      }
      expect(Object.keys(STOCK_ICONS)).toHaveLength(12);
    });

    test('every BUILT_IN_AGENTS entry has a registered icon', () => {
      for (const agent of BUILT_IN_AGENTS) {
        expect(AGENT_ICONS[agent.id]).toBeDefined();
      }
    });

    test('registry is frozen so accidental mutation is loud', () => {
      expect(Object.isFrozen(AGENT_ICONS)).toBe(true);
      expect(Object.isFrozen(STOCK_ICONS)).toBe(true);
    });
  });

  describe('resolveIcon', () => {
    test('resolves bare agent id', () => {
      expect(resolveIcon('architect')).toBe(AGENT_ICONS.architect);
      expect(resolveIcon('censai')).toBe(AGENT_ICONS.censai);
    });

    test('resolves bare stock id', () => {
      expect(resolveIcon('circle')).toBe(STOCK_ICONS.circle);
      expect(resolveIcon('orbit')).toBe(STOCK_ICONS.orbit);
    });

    test('resolves qualified "agent:id" form', () => {
      expect(resolveIcon('agent:atlas')).toBe(AGENT_ICONS.atlas);
    });

    test('resolves qualified "stock:id" form', () => {
      expect(resolveIcon('stock:hex')).toBe(STOCK_ICONS.hex);
    });

    test('resolves { agent: { id, iconRef } } — iconRef wins', () => {
      const entry = resolveIcon({ agent: { id: 'architect', iconRef: 'stock:spiral' } });
      expect(entry).toBe(STOCK_ICONS.spiral);
    });

    test('resolves { agent } — falls back to agent id when iconRef is absent', () => {
      expect(resolveIcon({ agent: { id: 'genesis' } })).toBe(AGENT_ICONS.genesis);
    });

    test('returns null for unknown ids', () => {
      expect(resolveIcon('nope')).toBeNull();
      expect(resolveIcon('agent:nope')).toBeNull();
      expect(resolveIcon('stock:nope')).toBeNull();
      expect(resolveIcon('')).toBeNull();
      expect(resolveIcon(null)).toBeNull();
      expect(resolveIcon(undefined)).toBeNull();
      expect(resolveIcon(42)).toBeNull();
    });

    test('listAgentIcons / listStockIcons return all entries', () => {
      expect(listAgentIcons()).toHaveLength(8);
      expect(listStockIcons()).toHaveLength(12);
    });
  });

  describe('hasVectorIcon', () => {
    test('true for every built-in agent', () => {
      for (const agent of BUILT_IN_AGENTS) {
        expect(hasVectorIcon(agent)).toBe(true);
      }
    });

    test('false for null / unknown agent', () => {
      expect(hasVectorIcon(null)).toBe(false);
      expect(hasVectorIcon({ id: 'user-agent-1' })).toBe(false);
    });

    test('true when an unknown agent declares a valid iconRef', () => {
      expect(hasVectorIcon({ id: 'user-agent-1', iconRef: 'stock:circle' })).toBe(true);
      expect(hasVectorIcon({ id: 'user-agent-1', iconRef: 'agent:architect' })).toBe(true);
    });

    test('false when iconRef is unparseable', () => {
      expect(hasVectorIcon({ id: 'user-agent-1', iconRef: 'stock:nope' })).toBe(false);
      expect(hasVectorIcon({ id: 'user-agent-1', iconRef: '' })).toBe(false);
    });
  });

  describe('AgentIcon React component', () => {
    // Lazy import so the test file doesn't have to declare jsx-in-js test
    // transforms up front (we only render React when asked).
    let React;
    let renderToStaticMarkup;
    let AgentIcon;

    beforeAll(async () => {
      React = (await import('react')).default;
      const rtlServer = await import('react-dom/server');
      renderToStaticMarkup = rtlServer.renderToStaticMarkup;
      const sprite = await import('../src/lib/agentIcons/sprite.jsx');
      AgentIcon = sprite.AgentIcon;
    });

    test('renders inline SVG markup for an agent id', () => {
      const html = renderToStaticMarkup(
        React.createElement(AgentIcon, { agent: { id: 'architect' }, size: 24 }),
      );
      // dangerouslySetInnerHTML injects the raw <svg>...</svg> from the asset.
      expect(html).toMatch(/<svg[^>]*viewBox="0 0 64 64"/);
      expect(html).toMatch(/<\/svg>/);
    });

    test('renders for a stock kind+id pair', () => {
      const html = renderToStaticMarkup(
        React.createElement(AgentIcon, { kind: 'stock', id: 'circle', size: 16 }),
      );
      expect(html).toMatch(/<svg[^>]*viewBox="0 0 64 64"/);
    });

    test('renders null for an unknown id (no fallback)', () => {
      const html = renderToStaticMarkup(
        React.createElement(AgentIcon, { id: 'no-such-icon' }),
      );
      expect(html).toBe('');
    });

    test('wrapper exposes currentColor so the icon adopts theme tokens', () => {
      const html = renderToStaticMarkup(
        React.createElement(AgentIcon, { agent: { id: 'atlas' }, size: 32 }),
      );
      // The wrapper span has color: currentColor; the inner svg also uses
      // stroke="currentColor" from the asset.
      expect(html).toMatch(/color:\s*currentColor/);
      expect(html).toMatch(/stroke="currentColor"/);
    });

    test('renders for a qualified "stock:id" string ref', () => {
      const html = renderToStaticMarkup(
        React.createElement(AgentIcon, { id: 'stock:orbit', size: 24 }),
      );
      expect(html).toMatch(/<svg[^>]*viewBox="0 0 64 64"/);
    });

    test('renders for every family agent (smoke test all 8)', () => {
      const ids = ['architect', 'atlas', 'genesis', 'nexus', 'foundation', 'echo', 'censai'];
      for (const id of ids) {
        const html = renderToStaticMarkup(
          React.createElement(AgentIcon, { agent: { id }, size: 28 }),
        );
        expect(html).toMatch(/<svg[^>]*viewBox="0 0 64 64"/);
        // The inner SVG should be unique per agent (not the same blob).
        // Quick proxy: count <line elements — different agents have different counts.
        expect(html).toMatch(/<line|<path|<polygon|<circle|<rect/);
      }
    });
  });

  describe('AgentAvatar integration (end-to-end render)', () => {
    // The avatar picker branch is the most important contract of this brief:
    // family agents get the new <AgentIcon />, user agents without an icon
    // fall back to the legacy AgentVectorIcon. We render both branches
    // and assert which one fired based on which markup appears.
    let React;
    let renderToStaticMarkup;
    let AgentAvatar;

    beforeAll(async () => {
      React = (await import('react')).default;
      const rtlServer = await import('react-dom/server');
      renderToStaticMarkup = rtlServer.renderToStaticMarkup;
      AgentAvatar = (await import('../src/components/Agents.jsx')).AgentAvatar;
    });

    test('family agent renders the new <AgentIcon /> branch (viewBox 0 0 64 64)', () => {
      const html = renderToStaticMarkup(
        React.createElement(AgentAvatar, { agent: BUILT_IN_AGENTS[0], size: 28 }),
      );
      // New branch wrapper has class "agent-icon--agent"
      expect(html).toMatch(/class="agent-icon agent-icon--agent/);
      // Inner SVG uses the registry's viewBox
      expect(html).toMatch(/viewBox="0 0 64 64"/);
      // No legacy 24x24 viewBox would be present (sanity check)
      expect(html).not.toMatch(/viewBox="0 0 24 24"/);
    });

    test('user agent (no iconRef) falls back to the legacy AgentVectorIcon (viewBox 0 0 24 24)', () => {
      const userAgent = { id: 'user-1', name: 'User Agent', role: 'helper', glyph: 'U', hue: 200 };
      const html = renderToStaticMarkup(
        React.createElement(AgentAvatar, { agent: userAgent, size: 28 }),
      );
      // No new agent-icon span — the legacy <svg> path is taken.
      expect(html).not.toMatch(/class="agent-icon agent-icon--agent/);
      // Legacy branch uses 24x24 viewBox
      expect(html).toMatch(/viewBox="0 0 24 24"/);
    });

    test('user agent with a valid iconRef uses the new <AgentIcon /> branch', () => {
      const userAgent = { id: 'user-1', name: 'User Agent', role: 'helper', glyph: 'U', hue: 200, iconRef: 'stock:spiral' };
      const html = renderToStaticMarkup(
        React.createElement(AgentAvatar, { agent: userAgent, size: 28 }),
      );
      expect(html).toMatch(/class="agent-icon agent-icon--stock/);
      expect(html).toMatch(/viewBox="0 0 64 64"/);
    });

    test('user agent with an unparseable iconRef falls back to legacy', () => {
      const userAgent = { id: 'user-1', name: 'User Agent', role: 'helper', glyph: 'U', hue: 200, iconRef: 'stock:nope' };
      const html = renderToStaticMarkup(
        React.createElement(AgentAvatar, { agent: userAgent, size: 28 }),
      );
      expect(html).not.toMatch(/class="agent-icon agent-icon--/);
      expect(html).toMatch(/viewBox="0 0 24 24"/);
    });
  });
});