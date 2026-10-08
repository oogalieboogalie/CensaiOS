import { createFigmaClient, parseFigmaFileUrl, resolveFigmaToken } from '../server/design/figmaClient.js';
import { colorToCss, figmaNodeToHtml, paintToBackgroundLayer } from '../server/design/figmaToHtml.js';
import { importFigmaFrame, listFigmaFrames } from '../server/design/figmaImport.js';
import { createFigmaFetch, FILE_KEY, FILE_URL, heroFrame } from './fixtures/figmaApi.js';

describe('parseFigmaFileUrl', () => {
  test('reads the file key and turns the share-link node id into an API id', () => {
    expect(parseFigmaFileUrl(FILE_URL)).toEqual({ fileKey: FILE_KEY, nodeId: '1:2' });
    expect(parseFigmaFileUrl('https://figma.com/file/KEY9/Old-style')).toEqual({ fileKey: 'KEY9', nodeId: null });
    expect(parseFigmaFileUrl('https://www.figma.com/proto/KEY7/x?node-id=10-20')).toEqual({ fileKey: 'KEY7', nodeId: '10:20' });
  });

  test('unwraps embed links and rejects everything that is not a Figma file', () => {
    const embed = `https://www.figma.com/embed?embed_host=share&url=${encodeURIComponent(FILE_URL)}`;
    expect(parseFigmaFileUrl(embed)).toEqual({ fileKey: FILE_KEY, nodeId: '1:2' });
    expect(parseFigmaFileUrl('https://evil.example/design/KEY')).toBeNull();
    expect(parseFigmaFileUrl('https://figma.com.evil.example/design/KEY')).toBeNull();
    expect(parseFigmaFileUrl('https://www.figma.com/community/plugins')).toBeNull();
    expect(parseFigmaFileUrl('not a url')).toBeNull();
  });
});

describe('figmaNodeToHtml', () => {
  const { html, width, height, fonts, stats } = figmaNodeToHtml(heroFrame, {
    imageUrls: { 'img-ref-1': 'https://s3.figma.example/img-ref-1.png' },
    svgUrls: { '1:6': 'https://render.figma.example/1:6.svg' },
  });

  test('produces a standalone document sized like the frame', () => {
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect([width, height]).toEqual([1440, 900]);
    expect(html).toContain('<main data-name="Hero" style="position: relative; width: 1440px; height: 900px;');
    expect(html).toContain('border-radius: 24px');
    expect(html).toContain('overflow: hidden');
    expect(html).toContain('0px 12px 40px 0px rgba(0, 0, 0, 0.25)');
  });

  test('positions children relative to the frame and keeps layer names', () => {
    expect(html).toContain('data-name="Headline" style="position: absolute; left: 120px; top: 180px; width: 800px; height: 120px;');
    expect(html).toContain('data-name="CTA button" style="position: absolute; left: 120px; top: 360px;');
  });

  test('text keeps its type styles and is escaped', () => {
    expect(html).toContain('Ship designs &lt;fast&gt;<br>with any model');
    expect(html).toContain('font-size: 64px');
    expect(html).toContain('line-height: 72px');
    expect(html).toContain('letter-spacing: -1.5px');
    expect(html).toContain('font-family: &quot;Inter&quot;, system-ui, sans-serif');
    expect(fonts).toEqual(['Inter']);
    expect(html).toContain('https://fonts.googleapis.com/css2?family=Inter:wght@700&display=swap');
  });

  test('gradients, strokes, image fills and vector renders come through', () => {
    expect(html).toContain('linear-gradient(90deg, rgb(99, 102, 242) 0%, rgb(237, 71, 153) 100%)');
    expect(html).toContain('inset 0 0 0 2px rgba(255, 255, 255, 0.4)');
    expect(html).toContain('url(&quot;https://s3.figma.example/img-ref-1.png&quot;) center / cover no-repeat');
    expect(html).toContain('<img data-name="Logo mark" alt="" src="https://render.figma.example/1:6.svg"');
    expect(html).not.toContain('Hidden layer');
    expect(stats).toMatchObject({ nodes: 5, text: 1, images: 1, vectors: 1 });
  });

  test('auto-width text stays on one line; fixed-width text wraps', () => {
    const base = { id: '5:1', type: 'TEXT', name: 'T', characters: 'Hi', absoluteBoundingBox: { x: 0, y: 0, width: 10, height: 10 } };
    const frameOf = (style) => ({ id: '5:0', type: 'FRAME', name: 'F', absoluteBoundingBox: { x: 0, y: 0, width: 50, height: 50 }, children: [{ ...base, style }] });
    expect(figmaNodeToHtml(frameOf({ textAutoResize: 'WIDTH_AND_HEIGHT' })).html).toContain('white-space: pre;');
    expect(figmaNodeToHtml(frameOf({ textAutoResize: 'HEIGHT' })).html).toContain('white-space: pre-wrap;');
  });

  test('color and paint helpers', () => {
    expect(colorToCss({ r: 1, g: 0, b: 0, a: 1 })).toBe('rgb(255, 0, 0)');
    expect(colorToCss({ r: 0, g: 0, b: 0, a: 1 }, 0.5)).toBe('rgba(0, 0, 0, 0.5)');
    expect(paintToBackgroundLayer({ type: 'SOLID', visible: false, color: {} })).toBeNull();
    expect(paintToBackgroundLayer({ type: 'IMAGE', imageRef: 'missing' }, {})).toBeNull();
  });

  test('refuses a layer with no geometry', () => {
    expect(() => figmaNodeToHtml({ id: '9:9', type: 'FRAME' })).toThrow(/no size/);
  });
});

describe('Figma client', () => {
  test('sends the personal access token as X-Figma-Token', async () => {
    const { fetchImpl, calls } = createFigmaFetch();
    const me = await createFigmaClient('figd_user_token', { fetchImpl }).me();
    expect(me.handle).toBe('Alex Designer');
    expect(calls[0].url.href).toBe('https://api.figma.com/v1/me');
    expect(calls[0].headers).toEqual({ 'X-Figma-Token': 'figd_user_token' });
  });

  test('maps Figma errors to clear codes', async () => {
    const { fetchImpl } = createFigmaFetch();
    await expect(createFigmaClient('wrong', { fetchImpl }).me()).rejects.toMatchObject({ code: 'FIGMA_TOKEN_INVALID', statusCode: 424 });
    await expect(createFigmaClient('figd_user_token', { fetchImpl }).file('nope')).rejects.toMatchObject({ code: 'FIGMA_NOT_FOUND' });
    const limited = createFigmaClient('t', { fetchImpl: async () => ({ ok: false, status: 429 }) });
    await expect(limited.me()).rejects.toMatchObject({ code: 'FIGMA_RATE_LIMITED', statusCode: 429 });
    expect(() => createFigmaClient('')).toThrow(expect.objectContaining({ code: 'FIGMA_TOKEN_REQUIRED' }));
  });

  test('token resolution prefers the user key, then the server key', async () => {
    expect(await resolveFigmaToken(7, { loadUserKey: async () => ({ apiKey: 'figd_mine' }) })).toEqual({ token: 'figd_mine', source: 'byok' });
    process.env.FIGMA_API_TOKEN = 'figd_server';
    expect(await resolveFigmaToken(7, { loadUserKey: async () => null })).toEqual({ token: 'figd_server', source: 'server' });
    expect(await resolveFigmaToken(7, { loadUserKey: async () => { throw new Error('vault down'); } })).toEqual({ token: 'figd_server', source: 'server' });
    delete process.env.FIGMA_API_TOKEN;
    expect(await resolveFigmaToken(null, { loadUserKey: async () => null })).toEqual({ token: '', source: null });
  });
});

describe('Figma import pipeline', () => {
  test('lists top-level frames on every page with thumbnails', async () => {
    const { fetchImpl, calls } = createFigmaFetch();
    const result = await listFigmaFrames(createFigmaClient('figd_user_token', { fetchImpl }), FILE_KEY);
    expect(result.name).toBe('Landing Page');
    expect(result.frames.map(f => [f.id, f.name, f.page, f.width, f.height])).toEqual([
      ['1:2', 'Hero', 'Web', 1440, 900],
      ['2:1', 'Pricing', 'Web', 1440, 1200],
      ['3:1', 'Home / iPhone', 'Mobile', 390, 844],
    ]);
    expect(result.frames[0].thumbnailUrl).toBe('https://render.figma.example/1:2.png');
    expect(calls[0].url.searchParams.get('depth')).toBe('2');
  });

  test('imports a frame as HTML plus a 2x pixel render', async () => {
    const { fetchImpl, calls } = createFigmaFetch();
    const result = await importFigmaFrame(createFigmaClient('figd_user_token', { fetchImpl }), FILE_KEY, '1:2');
    expect(result).toMatchObject({ fileKey: FILE_KEY, nodeId: '1:2', name: 'Hero', width: 1440, height: 900, renderUrl: 'https://render.figma.example/1:2.png' });
    expect(result.html).toContain('src="https://render.figma.example/1:6.svg"');
    expect(result.html).toContain('https://s3.figma.example/img-ref-1.png');
    const renderCall = calls.find(c => c.url.pathname === `/v1/images/${FILE_KEY}` && c.url.searchParams.get('format') === 'png');
    expect(renderCall.url.searchParams.get('scale')).toBe('2');
  });

  test('a missing frame is a 404', async () => {
    const { fetchImpl } = createFigmaFetch();
    await expect(importFigmaFrame(createFigmaClient('figd_user_token', { fetchImpl }), FILE_KEY, '99:1'))
      .rejects.toMatchObject({ code: 'FIGMA_NOT_FOUND', statusCode: 404 });
  });
});
