import { jest } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createReport, note, pickThemes, renderMarkdown, skip, summarize, writeReport } from './report.mjs';
import { MODULES, pickModules } from './modules/index.mjs';
import { STANDIN_ANSWER, startStandinModel } from './standinModel.mjs';

const quiet = () => jest.spyOn(console, 'log').mockImplementation(() => {});

describe('test team report', () => {
  afterEach(() => jest.restoreAllMocks());

  it('marks a broken step by its part: walk fails, hunt is a bug, red team is a gap', async () => {
    quiet();
    const report = createReport({ module: 'music', label: 'Music Player' });
    await report.check('walk', 'opens', () => 'opened');
    await report.check('walk', 'plays', () => { throw new Error('no sound\nstack line'); });
    await report.check('hunt', 'fake file', () => { throw new Error('says PLAYING'); });
    await report.check('redteam', 'teammate', () => { throw new Error('got through'); });
    await report.check('redteam', 'no engine', () => { throw skip('no Docker engine'); });
    await report.check('hunt', 'odd', () => { throw note('worth a look'); });
    expect(report.checks.map((c) => c.status)).toEqual(['pass', 'fail', 'bug', 'gap', 'skip', 'note']);
    expect(report.checks[1].detail).toBe('no sound');
    expect(summarize(report.checks)).toEqual({
      totals: { pass: 1, fail: 1, bug: 1, gap: 1, skip: 1, note: 1 },
      verdict: 'broken',
    });
  });

  it('says "works" only when nothing failed, and "with problems" for bugs or gaps', () => {
    expect(summarize([{ status: 'pass' }, { status: 'skip' }]).verdict).toBe('works');
    expect(summarize([{ status: 'pass' }, { status: 'gap' }]).verdict).toBe('works, with problems found');
  });

  it('writes a readable Markdown report and a JSON copy', async () => {
    quiet();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'team-report-'));
    const report = createReport({ module: 'docker', label: 'Docker window', now: () => new Date('2026-10-22T07:00:00Z') });
    await report.check('redteam', 'signed out | refused', () => 'answered 401');
    writeReport(report, dir);
    const md = fs.readFileSync(path.join(dir, 'report.md'), 'utf8');
    expect(md).toContain('# Test team: Docker window');
    expect(md).toContain('| signed out / refused | passed | answered 401 |');
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'report.json'), 'utf8')).verdict).toBe('works');
    expect(renderMarkdown(report)).toContain('**Verdict: works.**');
  });
});

describe('test team themes', () => {
  afterEach(() => jest.restoreAllMocks());

  it('reads TEST_TEAM_THEMES, dark by default', () => {
    expect(pickThemes(undefined)).toEqual(['dark']);
    expect(pickThemes('dark,light')).toEqual(['dark', 'light']);
    expect(pickThemes('light light, purple')).toEqual(['light']);
    expect(pickThemes('purple')).toEqual(['dark']);
  });

  it('names pictures by theme on disk and links every theme in the report', async () => {
    quiet();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'team-themes-'));
    const page = { screenshot: async ({ path: file }) => fs.writeFileSync(file, 'png') };
    const runIn = async (theme) => {
      const report = createReport({ module: 'music', label: 'Music Player', outDir: dir, theme });
      await report.check('walk', 'opens', async ({ shot }) => { await shot(page, 'pat-opens'); return 'opened'; });
      return report;
    };
    const dark = await runIn('dark');
    const light = await runIn('light');
    await light.check('hunt', 'fake file', () => { throw new Error('says PLAYING'); });
    writeReport(dark, dir, [light]);
    const md = fs.readFileSync(path.join(dir, 'report.md'), 'utf8');
    expect(fs.readdirSync(dir).filter((f) => f.endsWith('.png')).sort()).toEqual(['dark-01-pat-opens.png', 'light-01-pat-opens.png']);
    expect(md).toContain('01-pat-opens: [dark](dark-01-pat-opens.png) [light](light-01-pat-opens.png)');
    expect(md).toContain('In the light theme: works, with problems found; "fake file" (BUG).');
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'report.json'), 'utf8')).otherThemes[0].theme).toBe('light');
  });
});

describe('test team rotation', () => {
  it('takes one module a day in turn, or the ones asked for', () => {
    const day = 24 * 60 * 60 * 1000;
    const seen = MODULES.map((_, n) => pickModules('next', new Date(n * day))[0].id);
    expect(new Set(seen).size).toBe(MODULES.length);
    expect(pickModules('all')).toHaveLength(MODULES.length);
    expect(pickModules('music, docker').map((m) => m.id)).toEqual(['music', 'docker']);
    expect(() => pickModules('nope')).toThrow(/known: music, docker, teamChat, framedPages, windowGroups, leadHound, figma, agentRegistry, chatCapabilities/);
  });
});

describe('stand-in model', () => {
  it('answers in the OpenAI chat shape and counts the calls', async () => {
    const model = await startStandinModel(0);
    try {
      const res = await fetch(`http://127.0.0.1:${model.port}/v1/chat/completions`, {
        method: 'POST',
        body: JSON.stringify({ model: 'standin', messages: [{ role: 'user', content: 'hi' }] }),
      });
      expect((await res.json()).choices[0].message.content).toBe(STANDIN_ANSWER);
      expect(model.calls()).toBe(1);
    } finally {
      await model.close();
    }
  });
});
