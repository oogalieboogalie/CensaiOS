// Mocked Figma REST API responses shaped like the real ones
// (GET /v1/files/:key, /v1/files/:key/nodes, /v1/images/:key, /v1/files/:key/images, /v1/me).

export const FILE_KEY = 'AbC123xyz';
export const FILE_URL = `https://www.figma.com/design/${FILE_KEY}/Landing-Page?node-id=1-2&t=abc`;

const solid = (r, g, b, a = 1) => ({ type: 'SOLID', visible: true, color: { r, g, b, a } });

export const heroFrame = {
  id: '1:2',
  name: 'Hero',
  type: 'FRAME',
  clipsContent: true,
  absoluteBoundingBox: { x: 100, y: 200, width: 1440, height: 900 },
  fills: [solid(0.06, 0.09, 0.16)],
  cornerRadius: 24,
  effects: [{ type: 'DROP_SHADOW', visible: true, radius: 40, spread: 0, offset: { x: 0, y: 12 }, color: { r: 0, g: 0, b: 0, a: 0.25 } }],
  children: [
    {
      id: '1:3',
      name: 'Headline',
      type: 'TEXT',
      absoluteBoundingBox: { x: 220, y: 380, width: 800, height: 120 },
      characters: 'Ship designs <fast>\nwith any model',
      style: { fontFamily: 'Inter', fontWeight: 700, fontSize: 64, lineHeightPx: 72, letterSpacing: -1.5, textAlignHorizontal: 'LEFT', textAlignVertical: 'TOP' },
      fills: [solid(1, 1, 1)],
    },
    {
      id: '1:4',
      name: 'CTA button',
      type: 'RECTANGLE',
      absoluteBoundingBox: { x: 220, y: 560, width: 200, height: 56 },
      fills: [{
        type: 'GRADIENT_LINEAR', visible: true,
        gradientHandlePositions: [{ x: 0, y: 0.5 }, { x: 1, y: 0.5 }, { x: 0, y: 1 }],
        gradientStops: [{ position: 0, color: { r: 0.39, g: 0.4, b: 0.95, a: 1 } }, { position: 1, color: { r: 0.93, g: 0.28, b: 0.6, a: 1 } }],
      }],
      strokes: [solid(1, 1, 1, 0.4)],
      strokeWeight: 2,
      strokeAlign: 'INSIDE',
      rectangleCornerRadii: [12, 12, 12, 12],
    },
    {
      id: '1:5',
      name: 'Photo',
      type: 'RECTANGLE',
      absoluteBoundingBox: { x: 900, y: 300, width: 480, height: 480 },
      fills: [{ type: 'IMAGE', visible: true, imageRef: 'img-ref-1', scaleMode: 'FILL' }],
    },
    {
      id: '1:6',
      name: 'Logo mark',
      type: 'VECTOR',
      absoluteBoundingBox: { x: 140, y: 240, width: 32, height: 32 },
      fills: [solid(0.39, 0.4, 0.95)],
    },
    { id: '1:7', name: 'Hidden layer', type: 'RECTANGLE', visible: false, absoluteBoundingBox: { x: 0, y: 0, width: 10, height: 10 } },
  ],
};

export const fileResponse = {
  name: 'Landing Page',
  lastModified: '2026-10-01T12:00:00Z',
  thumbnailUrl: 'https://figma-alpha-api.s3.us-west-2.amazonaws.com/thumbnails/file.png',
  document: {
    id: '0:0',
    type: 'DOCUMENT',
    children: [
      {
        id: '0:1', name: 'Web', type: 'CANVAS',
        children: [
          { id: '1:2', name: 'Hero', type: 'FRAME', absoluteBoundingBox: heroFrame.absoluteBoundingBox },
          { id: '2:1', name: 'Pricing', type: 'FRAME', absoluteBoundingBox: { x: 1700, y: 200, width: 1440, height: 1200 } },
          { id: '2:9', name: 'Loose note', type: 'TEXT', absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 20 } },
        ],
      },
      { id: '0:2', name: 'Mobile', type: 'CANVAS', children: [
        { id: '3:1', name: 'Home / iPhone', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 0, width: 390, height: 844 } },
      ] },
    ],
  },
};

/** A fetch stand-in that answers like api.figma.com and records calls. */
export function createFigmaFetch({ token = 'figd_user_token' } = {}) {
  const calls = [];
  const ok = (body) => ({ ok: true, status: 200, json: async () => body });
  const fetchImpl = async (input, init = {}) => {
    const url = new URL(String(input));
    calls.push({ url, headers: init.headers || {} });
    if (init.headers?.['X-Figma-Token'] !== token) return { ok: false, status: 403, json: async () => ({ status: 403, err: 'Invalid token' }) };
    const path = url.pathname.replace('/v1', '');
    if (path === '/me') return ok({ id: '42', handle: 'Alex Designer', email: 'alex@example.com' });
    if (path === `/files/${FILE_KEY}`) return ok(fileResponse);
    if (path === `/files/${FILE_KEY}/nodes`) {
      const ids = url.searchParams.get('ids').split(',');
      return ok({ name: 'Landing Page', nodes: Object.fromEntries(ids.map(id => [id, id === '1:2' ? { document: heroFrame } : null])) });
    }
    if (path === `/files/${FILE_KEY}/images`) return ok({ error: false, status: 200, meta: { images: { 'img-ref-1': 'https://s3.figma.example/img-ref-1.png' } } });
    if (path === `/images/${FILE_KEY}`) {
      const ids = url.searchParams.get('ids').split(',');
      const format = url.searchParams.get('format');
      return ok({ err: null, images: Object.fromEntries(ids.map(id => [id, `https://render.figma.example/${id}.${format}`])) });
    }
    return { ok: false, status: 404, json: async () => ({ status: 404, err: 'Not found' }) };
  };
  return { fetchImpl, calls };
}
