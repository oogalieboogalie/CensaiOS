import fs from 'node:fs';
import { jest } from '@jest/globals';
import { getAgentCardInstallOwnershipSummary } from '../server/agent-registry/installStatus.js';

test('AgentCard install migration is workspace-owned and additive', () => {
  const sql = fs.readFileSync('docker/041-agent-card-installs.sql', 'utf8');
  expect(sql).toContain('CREATE TABLE IF NOT EXISTS workspace_agent_card_installs');
  expect(sql).toContain('PRIMARY KEY (workspace_id, card_id)');
  expect(sql).toContain('REFERENCES workspaces(id) ON DELETE CASCADE');
  expect(sql).toContain('REFERENCES agent_cards(id) ON DELETE CASCADE');
  expect(sql).toContain('installed_by_user_id BIGINT NOT NULL REFERENCES users(id)');
  expect(sql).not.toMatch(/INSERT INTO\s+workspace_agent_card_installs/i);
});

test('database readiness applies the install schema after AgentCard tenancy', () => {
  const source = fs.readFileSync('server/boot/database.js', 'utf8');
  expect(source).toContain("from '../agent-registry/installSchema.js'");
  expect(source.indexOf('ensureAgentCardTenancySchema(pool)'))
    .toBeLessThan(source.indexOf('ensureAgentCardInstallSchema(pool)'));
});

test('install ownership status reports durable workspace counts', async () => {
  const db = { query: jest.fn(async () => ({ rows: [{
    total_count: 3, workspace_count: 2, card_count: 2,
  }] })) };
  await expect(getAgentCardInstallOwnershipSummary(db)).resolves.toEqual({
    ready: true, totalCount: 3, workspaceCount: 2, cardCount: 2,
  });
});
