import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const { loadFamilyAgentOverrides, getFamilyAgentSystem, overrideFilePath, __resetFamilyAgentOverrides } =
  await import('../server/agents/familyOverrides.js');
const { FAMILY_AGENT_SYSTEMS } = await import('../src/data/family-agents.js');

let dir;
let file;

beforeEach(async () => {
  dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'censai-family-override-'));
  file = path.join(dir, 'family-agents.json');
  delete process.env.CENSAI_FAMILY_AGENTS_FILE;
  __resetFamilyAgentOverrides();
});

afterEach(async () => {
  delete process.env.CENSAI_FAMILY_AGENTS_FILE;
  __resetFamilyAgentOverrides();
  await fs.promises.rm(dir, { recursive: true, force: true });
});

describe('family agent prompt overrides', () => {
  test('canonical defaults stand with no override file', () => {
    process.env.CENSAI_FAMILY_AGENTS_FILE = path.join(dir, 'does-not-exist.json');
    expect(loadFamilyAgentOverrides()).toEqual({});
    expect(getFamilyAgentSystem('atlas')).toBe(FAMILY_AGENT_SYSTEMS.atlas);
  });

  test('operator prompts win, unknown ids and blanks are ignored', async () => {
    await fs.promises.writeFile(file, JSON.stringify({
      _comment: 'ignored',
      atlas: 'Custom Atlas prompt.',
      nobody: 'Ignored: unknown id.',
      censai: '   ',
    }), 'utf8');
    process.env.CENSAI_FAMILY_AGENTS_FILE = file;
    expect(getFamilyAgentSystem('atlas')).toBe('Custom Atlas prompt.');
    expect(getFamilyAgentSystem('censai')).toBe(FAMILY_AGENT_SYSTEMS.censai);
    expect(getFamilyAgentSystem('nobody')).toBeNull();
  });

  test('invalid JSON falls back to canonical', async () => {
    await fs.promises.writeFile(file, '{oops', 'utf8');
    process.env.CENSAI_FAMILY_AGENTS_FILE = file;
    expect(getFamilyAgentSystem('nexus')).toBe(FAMILY_AGENT_SYSTEMS.nexus);
  });

  test('default path targets the repo config dir', () => {
    expect(overrideFilePath().replace(/\\/g, '/')).toMatch(/config\/family-agents\.json$/);
  });
});
