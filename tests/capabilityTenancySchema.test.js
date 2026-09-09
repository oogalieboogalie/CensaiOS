import fs from 'node:fs';

test('capability tenancy migration is additive and quarantines the global table', () => {
  const sql = fs.readFileSync('docker/039-agent-capability-tenancy.sql', 'utf8');
  expect(sql).toContain('CREATE TABLE IF NOT EXISTS workspace_agent_capabilities');
  expect(sql).toContain('PRIMARY KEY (workspace_id, agent_id, module_id)');
  expect(sql).toContain("CHECK (mode = 'autonomous')");
  expect(sql).toContain('equipped_by_user_id  INTEGER REFERENCES users(id)');
  expect(sql).not.toMatch(/ALTER TABLE\s+agent_capabilities/i);
  expect(sql).not.toMatch(/INSERT INTO\s+workspace_agent_capabilities[\s\S]*SELECT[\s\S]*agent_capabilities/i);
});

test('capability boot applies legacy declaration before the scoped table', () => {
  const boot = fs.readFileSync('server/boot/capabilitySchema.js', 'utf8');
  expect(boot.indexOf('021-agent-capabilities.sql')).toBeLessThan(boot.indexOf('039-agent-capability-tenancy.sql'));
});

test('readiness fails closed on an unavailable capability ownership schema', () => {
  const health = fs.readFileSync('server/health.js', 'utf8');
  const ownership = fs.readFileSync('server/healthOwnership.js', 'utf8');
  expect(ownership).toContain('getCapabilityOwnershipSummary');
  expect(health).toContain('&& capabilityOwnership.ready');
  expect(health).toContain("'agent_capability_ownership_unavailable'");
});
