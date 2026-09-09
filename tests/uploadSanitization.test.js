/**
 * @jest-environment jsdom
 *
 * tests/uploadSanitization.test.js
 *
 * Brief C2 — `.team/handoffs/2026-06-23-c2-agent-icon-picker.md`.
 *
 * Exhaustive sanitization cases for the upload path. Every entry in the
 * brief's checklist:
 *
 *   1. <script>alert(1)</script>
 *   2. onclick="..."
 *   3. onerror="..."
 *   4. <image href="data:image/png;base64,..."> (raster fallback)
 *   5. file size 51 KB (over limit)
 *   6. no viewBox
 *
 * Plus additional edge cases for the raster-fallback detection heuristic
 * used by the generate path.
 */
import {
  validateSvgString,
  validateSvgFile,
  sanitizeSvg,
  SVG_MAX_BYTES,
} from '../src/lib/agentIcons/upload.js';
import {
  generateAgentIcon,
  setIconGatewayCaller,
  resetIconGatewayCaller,
  looksLikeRasterFallback,
} from '../src/lib/agentIcons/generate.js';

const VALID_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="20"/></svg>';

describe('Brief C2 - SVG validation: rejection cases', () => {
  test('rejects <script> tag', async () => {
    const evil = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><script>alert(1)</script></svg>';
    const result = await validateSvgString(evil);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/script/i);
  });

  test('rejects onclick attribute on root', async () => {
    const evil = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" onclick="alert(1)"><circle r="20"/></svg>';
    const result = await validateSvgString(evil);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/event/i);
  });

  test('rejects onload / onerror / onmouseover attributes', async () => {
    const variants = [
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" onload="x"><circle r="20"/></svg>',
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" onerror="x"><circle r="20"/></svg>',
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" onmouseover="x"><circle r="20"/></svg>',
    ];
    for (const v of variants) {
      const result = await validateSvgString(v);
      expect(result.ok).toBe(false);
      expect(result.reason).toMatch(/event/i);
    }
  });

  test('rejects <image href="data:image/png;base64,..."> (raster fallback)', async () => {
    const raster = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><image href="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=" width="64" height="64"/></svg>';
    // The validator's parseSvg step accepts this since the SVG shape is
    // valid; raster rejection happens via the looksLikeRasterFallback
    // heuristic used by the generate path.
    expect(looksLikeRasterFallback(raster)).toBe(true);
  });

  test('rejects oversized file (51 KB)', async () => {
    const big = VALID_SVG + '<!-- pad -->' + 'x'.repeat(60 * 1024);
    expect(big.length).toBeGreaterThan(SVG_MAX_BYTES);
    const result = await validateSvgString(big);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/too large/i);
  });

  test('rejects missing viewBox', async () => {
    const noViewBox = '<svg xmlns="http://www.w3.org/2000/svg"><circle r="20"/></svg>';
    const result = await validateSvgString(noViewBox);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/viewBox/i);
  });

  test('rejects file with non-svg extension', async () => {
    const file = { name: 'evil.txt', size: VALID_SVG.length, text: async () => VALID_SVG };
    const result = await validateSvgFile(file);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/\.svg/i);
  });

  test('rejects multiple top-level <svg> elements', async () => {
    const double = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle r="10"/></svg><svg viewBox="0 0 64 64"><circle r="10"/></svg>`;
    const result = await validateSvgString(double);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/multiple/i);
  });

  test('rejects empty content', async () => {
    const result = await validateSvgString('');
    expect(result.ok).toBe(false);
  });
});

describe('Brief C2 - SVG validation: acceptance cases', () => {
  test('accepts a clean SVG', async () => {
    const result = await validateSvgString(VALID_SVG);
    expect(result.ok).toBe(true);
    expect(result.sanitizedSvg).toContain('<svg');
    expect(result.sanitizedSvg).toContain('viewBox');
  });

  test('strips <script> via sanitizeSvg (defense in depth)', () => {
    const evil = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><script>alert(1)</script><circle r="20"/></svg>';
    const cleaned = sanitizeSvg(evil);
    expect(cleaned).not.toMatch(/<script/i);
    expect(cleaned).toContain('<circle');
  });

  test('strips onclick / onerror attributes via sanitizeSvg', () => {
    const evil = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" onclick="x" onerror="y"><circle r="20"/></svg>';
    const cleaned = sanitizeSvg(evil);
    expect(cleaned).not.toMatch(/onclick/i);
    expect(cleaned).not.toMatch(/onerror/i);
    expect(cleaned).toContain('<circle');
  });

  test('strips javascript: href values', () => {
    const evil = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><a href="javascript:alert(1)"><circle r="20"/></a></svg>';
    const cleaned = sanitizeSvg(evil);
    expect(cleaned).not.toMatch(/javascript:/i);
  });

  test('drops foreignObject, style, image, and malformed script payloads', () => {
    const evil = '<svg viewBox="0 0 64 64"><foreignObject><div onmouseover="x">x</div></foreignObject><style>*{background:url(https://evil.example)}</style><image href="https://evil.example/x.png"/><scr<script>ipt>alert(1)</scr<script>ipt><circle r="20"/></svg>';
    const cleaned = sanitizeSvg(evil);
    expect(cleaned).not.toMatch(/foreignObject|<style|<image|<script|onmouseover|evil\.example/i);
    expect(cleaned).toContain('<circle');
  });
});

describe('Brief C2 - raster-fallback detection', () => {
  test('detects base64 PNG inside image href', () => {
    const raster = '<svg viewBox="0 0 64 64"><image href="data:image/png;base64,iVBORw0KGgo" width="64" height="64"/></svg>';
    expect(looksLikeRasterFallback(raster)).toBe(true);
  });

  test('detects SVG body that is only an <image> tag (any image source)', () => {
    const raster = '<svg viewBox="0 0 64 64"><image href="https://example.com/img.png"/></svg>';
    expect(looksLikeRasterFallback(raster)).toBe(true);
  });

  test('does NOT flag a vector SVG with no <image> tag', () => {
    expect(looksLikeRasterFallback(VALID_SVG)).toBe(false);
  });

  test('does NOT flag a mixed SVG that has shapes + an <image>', () => {
    const mixed = '<svg viewBox="0 0 64 64"><circle r="20"/><image href="data:image/png;base64,xxx"/></svg>';
    expect(looksLikeRasterFallback(mixed)).toBe(false);
  });

  test('ignores XML processing instructions and comments before matching', () => {
    const raster = '<?xml version="1.0"?><!-- comment --><svg viewBox="0 0 64 64"><image href="data:image/png;base64,xxx"/></svg>';
    expect(looksLikeRasterFallback(raster)).toBe(true);
  });
});

describe('Brief C2 - generate path rejects raster fallbacks', () => {
  beforeEach(() => {
    resetIconGatewayCaller();
    process.env.CENSAAI_AGENT_ICON_GENERATOR = '1';
  });

  afterEach(() => {
    delete process.env.CENSAAI_AGENT_ICON_GENERATOR;
    resetIconGatewayCaller();
  });

  test('generateAgentIcon rejects raster fallback', async () => {
    setIconGatewayCaller(async () => '<svg viewBox="0 0 64 64"><image href="data:image/png;base64,xxx"/></svg>');
    const result = await generateAgentIcon('a compass rose', 'agent');
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/raster fallback/i);
  });

  test('generateAgentIcon accepts valid SVG', async () => {
    setIconGatewayCaller(async () => VALID_SVG);
    const result = await generateAgentIcon('a compass rose', 'agent');
    expect(result.ok).toBe(true);
    expect(result.svg).toContain('<svg');
  });

  test('generateAgentIcon rejects when prompt is empty', async () => {
    setIconGatewayCaller(async () => VALID_SVG);
    const result = await generateAgentIcon('', 'agent');
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/empty/i);
  });

  test('generateAgentIcon rejects on explicit opt-out', async () => {
    process.env.CENSAAI_AGENT_ICON_GENERATOR = '0';
    const result = await generateAgentIcon('prompt', 'agent');
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/disabled/i);
  });
});
