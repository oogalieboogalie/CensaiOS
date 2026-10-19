import { chunkAndTag, fileText, splitSteps, tagText } from '../server/research/ingest.js';
import { rankChunks } from '../server/research/retrieve.js';
import { saveFile } from '../server/research/service.js';

const DOGS = `5 steps to cleaning dogs

1. Brush the dog before the bath so loose hair comes out.
2. Wet the dog with warm water, keeping it out of the ears.
3. Lather dog shampoo from the neck back and scrub gently.
4. Rinse until the water runs clear; leftover shampoo itches.
5. Towel dry, then let the dog shake it off outside.`;

describe('chunk and tag (diagram 13)', () => {
  test('numbered steps become one piece each', () => {
    const split = splitSteps(DOGS);
    expect(split.steps).toHaveLength(5);
    expect(split.intro).toBe('5 steps to cleaning dogs');
    expect(splitSteps('Just a paragraph.\nAnd another line.')).toBeNull();
  });

  test('a how-to file gets five tagged steps and source tags', () => {
    const out = chunkAndTag(DOGS, { title: 'Dog washing guide' });
    expect(out.kind).toBe('how-to');
    expect(out.chunks).toHaveLength(5);
    expect(out.tags).toEqual(expect.arrayContaining(['how-to', 'dog']));
    for (const chunk of out.chunks) expect(chunk.tags).toEqual(expect.arrayContaining(['how-to', 'dog']));
    expect(out.chunks[0].text).toContain('5 steps to cleaning dogs');
    expect(out.chunks[3].tags).toContain('rinse');
  });

  test('tags skip filler words and numbers', () => {
    const tags = tagText('The 2 things you should use are a brush and a towel and a brush.');
    expect(tags[0]).toBe('brush');
    expect(tags).not.toEqual(expect.arrayContaining(['the', 'should', 'use', '2']));
  });

  test('HTML files lose their markup', () => {
    expect(fileText('a.html', '<h1>Hi</h1><script>x()</script><p>Dogs &amp; cats</p>').replace(/\s+/g, ' ').trim()).toBe('Hi Dogs & cats');
    expect(fileText('a.md', '# Hi <b>')).toBe('# Hi <b>');
  });

  test('a tag finds a piece even when the word is not in its text', () => {
    const chunks = [
      { text: 'Towel dry, then let it shake outside.', tags: ['dog', 'towel'] },
      { text: 'Quarterly taxes are due in April.', tags: ['taxes'] },
    ];
    expect(rankChunks('dog', chunks, { k: 1 })[0].text).toContain('Towel dry');
  });

  test('saveFile stores the pieces with their tags under the file name', async () => {
    const saved = [];
    const store = { saveSource: async (scope, source) => { saved.push(source); return { id: 's1', ...source }; } };
    await saveFile({ workspaceId: 'w1' }, { name: 'dog-washing.md', text: DOGS }, { embedder: null, store });
    expect(saved[0]).toMatchObject({ url: 'file:dog-washing.md', title: 'dog-washing.md', kind: 'how-to' });
    expect(saved[0].chunks).toHaveLength(5);
    expect(saved[0].chunks[2].tags).toContain('how-to');
    await expect(saveFile({ workspaceId: 'w1' }, { name: 'x.txt', text: '  ' }, { embedder: null, store })).rejects.toThrow('no text');
  });
});
