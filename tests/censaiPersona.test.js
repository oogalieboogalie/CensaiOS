import fs from 'node:fs';
import { FAMILY_AGENT_SYSTEMS, FAMILY_AGENT_BY_ID } from '../src/data/family-agents.js';
import { agentPersona } from '../src/lib/chat/persona.js';

const prompt = FAMILY_AGENT_SYSTEMS.censai;
const sqlLiteral = `E'${prompt.replace(/'/g, "''").replace(/\n/g, '\\n')}'`;

describe("Censai's persona", () => {
  test('is the first AI partner, not a newsletter writer', () => {
    expect(prompt).toMatch(/^You are Censai, .*first AI partner/);
    expect(prompt).not.toMatch(/newsletter/i);
    expect(FAMILY_AGENT_BY_ID.censai.role).toBe('Partner · mentor');
    expect(agentPersona({ id: 'censai', name: 'Censai' }).starters.join(' ')).not.toMatch(/newsletter/i);
  });

  test('names every other family agent as a piece of Censai', () => {
    for (const name of ['Atlas', 'Nexus', 'Foundation', 'Genesis', 'Echo', 'The Architect', 'Phoenix']) {
      expect(prompt).toContain(name);
    }
  });

  test('the database seeds carry the same prompt as the app', () => {
    for (const file of ['docker/init.sql', 'docker/052-family-agent-rows.sql']) {
      const sql = fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
      expect(sql).toContain(sqlLiteral);
    }
  });

  test('existing installs only lose the old newsletter prompt, never a custom one', () => {
    const sql = fs.readFileSync(new URL('../docker/052-family-agent-rows.sql', import.meta.url), 'utf8');
    expect(sql).toMatch(/UPDATE agents SET[\s\S]*WHERE id = 'censai' AND system_prompt LIKE 'You are Censai, the editorial lead for a weekly AI newsletter\.%';/);
  });
});
