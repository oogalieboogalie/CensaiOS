import { createFigmaClient } from '../server/design/figmaClient.js';
import { importFigmaFrame, listFigmaFrames } from '../server/design/figmaImport.js';
import { frameForShareLink } from '../server/design/figmaSections.js';
import { onLogRecord } from '../server/logger.js';
import { selectionForLink } from '../src/components/figma/figmaLink.js';

const FILE_KEY = 'SecFile1';
const TOKEN = 'figd_user_token';
const SECTION = 'Campaigns';

// One page, one Section, two frames inside it, plus a frame that sits on the page.
function sectionFile() {
  return {
    name: 'Campaigns file',
    lastModified: '2026-10-02T00:00:00Z',
    document: {
      id: '0:0',
      type: 'DOCUMENT',
      children: [{
        id: '0:1',
        name: 'Marketing',
        type: 'CANVAS',
        children: [
          { id: '4:1', name: 'Poster', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 0, width: 400, height: 300 } },
          {
            id: '8:1',
            name: SECTION,
            type: 'SECTION',
            children: [
              { id: '8:2', name: 'Hero', type: 'FRAME', absoluteBoundingBox: { x: 240, y: 40, width: 800, height: 600 } },
              { id: '8:3', name: 'Pricing', type: 'FRAME', absoluteBoundingBox: { x: 1100, y: 40, width: 800, height: 900 } },
              { id: '8:4', name: 'Note', type: 'TEXT', absoluteBoundingBox: { x: 0, y: 0, width: 40, height: 20 } },
              { id: '8:5', name: 'Hidden', type: 'FRAME', visible: false, absoluteBoundingBox: { x: 0, y: 0, width: 10, height: 10 } },
            ],
          },
        ],
      }],
    },
  };
}

function frameNode(id, name, height) {
  return {
    id,
    name,
    type: 'FRAME',
    absoluteBoundingBox: { x: 0, y: 0, width: 800, height },
    children: [],
  };
}

function createSectionFetch() {
  const calls = [];
  const fetchImpl = async (input, init = {}) => {
    const url = new URL(String(input));
    calls.push({ url, headers: init.headers || {} });
    if (init.headers?.['X-Figma-Token'] !== TOKEN) return { ok: false, status: 403, json: async () => ({}) };
    const path = url.pathname.replace('/v1', '');
    if (path === `/files/${FILE_KEY}`) return { ok: true, status: 200, json: async () => sectionFile() };
    if (path === `/files/${FILE_KEY}/nodes`) {
      const ids = url.searchParams.get('ids').split(',');
      const known = { '8:2': frameNode('8:2', 'Hero', 600), '8:3': frameNode('8:3', 'Pricing', 900) };
      return {
        ok: true,
        status: 200,
        json: async () => ({
          name: 'Campaigns file',
          nodes: Object.fromEntries(ids.map((id) => [id, known[id] ? { document: known[id] } : null])),
        }),
      };
    }
    if (path === `/images/${FILE_KEY}`) {
      const ids = url.searchParams.get('ids').split(',');
      const format = url.searchParams.get('format') || 'png';
      return { ok: true, status: 200, json: async () => ({ images: Object.fromEntries(ids.map((id) => [id, `https://render.figma.example/${id}.${format}`])) }) };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };
  return { fetchImpl, calls };
}

const secondFrameLink = `https://www.figma.com/design/${FILE_KEY}/Campaigns?node-id=8-3`;

describe('frames inside a Figma Section', () => {
  test('lists both frames under the section name and resolves a link to the second', async () => {
    const { fetchImpl, calls } = createSectionFetch();
    const client = createFigmaClient(TOKEN, { fetchImpl });
    const result = await listFigmaFrames(client, FILE_KEY, { nodeId: '8:3' });

    expect(calls[0].url.searchParams.get('depth')).toBe('3');
    expect(calls[0].headers['X-Figma-Token']).toBe(TOKEN);
    expect(result.frames.map((frame) => [frame.id, frame.name, frame.section, frame.page])).toEqual([
      ['4:1', 'Poster', '', 'Marketing'],
      ['8:2', 'Hero', SECTION, 'Marketing'],
      ['8:3', 'Pricing', SECTION, 'Marketing'],
    ]);
    expect(result.frames.some((frame) => frame.type === 'SECTION' || frame.name === 'Hidden' || frame.name === 'Note')).toBe(false);
    expect(result.linkFrameId).toBe('8:3');
    expect(result.linkError).toBeNull();

    const resolved = frameForShareLink(result.frames, secondFrameLink);
    expect(resolved.reason).toBeNull();
    expect(resolved.frame).toMatchObject({ id: '8:3', name: 'Pricing', section: SECTION });
    expect(selectionForLink(result.frames, secondFrameLink)).toEqual({ ids: ['8:3'], error: '', page: 'Marketing' });
  });

  test('a link to a missing frame says why, and an import logs one line', async () => {
    const records = [];
    const off = onLogRecord((record) => {
      if (record.namespace === 'figma-import') records.push(record);
    });
    try {
      const { fetchImpl } = createSectionFetch();
      const client = createFigmaClient(TOKEN, { fetchImpl });
      const missing = `https://www.figma.com/design/${FILE_KEY}/Campaigns?node-id=9-9`;

      const listed = await listFigmaFrames(client, FILE_KEY, { nodeId: '9:9' });
      expect(listed.linkFrameId).toBeNull();
      expect(listed.linkError).toBe('That frame is not in this file.');
      expect(frameForShareLink(listed.frames, missing)).toMatchObject({ frame: null, reason: 'That frame is not in this file.' });
      expect(selectionForLink(listed.frames, missing).error).toBe('That frame is not in this file.');

      const imported = await importFigmaFrame(client, FILE_KEY, '8:3');
      expect(imported).toMatchObject({ nodeId: '8:3', name: 'Pricing' });
      const infos = records.filter((record) => record.level === 'info');
      expect(infos).toHaveLength(1);
      expect(infos[0].message).toBe(`import file ${FILE_KEY}: 3 frames found, imported 8:3`);
      expect(infos[0].meta).toEqual({ fileKey: FILE_KEY, framesFound: 3, imported: '8:3' });

      await expect(importFigmaFrame(client, FILE_KEY, '9:9')).rejects.toMatchObject({ code: 'FIGMA_NOT_FOUND', statusCode: 404 });
      expect(records.filter((record) => record.level === 'info')).toHaveLength(1);
      const warnings = records.filter((record) => record.level === 'warn');
      expect(warnings.map((record) => record.meta.nodeId)).toEqual(['9:9', '9:9']);
      expect(warnings.every((record) => record.message.includes(FILE_KEY) && !record.message.includes('Pricing'))).toBe(true);
    } finally {
      off();
    }
  });
});
