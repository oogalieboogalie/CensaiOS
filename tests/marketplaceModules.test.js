import path from 'path';
import { fileURLToPath } from 'url';
import { runModuleChecks, prohibitedUse } from '../server/marketplace/moduleChecks.js';
import { namesTooClose, previewModuleListing } from '../server/marketplace/moduleListings.js';
import { certificateBody, fingerprint, signCertificate, signingKeys, verifyCertificate } from '../server/marketplace/signing.js';
import { browserModuleFingerprint, moduleCard } from '../src/lib/marketplace/moduleCard.js';
import { readModuleDir } from '../server/modules/examples.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Enough of Postgres for the signing key table.
function keyDb() {
  const rows = new Map();
  return {
    rows,
    async query(sql, params = []) {
      if (/^\s*CREATE/i.test(sql)) return { rows: [] };
      if (/^SELECT/i.test(sql)) return { rows: rows.has(params[0]) ? [rows.get(params[0])] : [] };
      if (/^INSERT/i.test(sql)) {
        if (!rows.has(params[0])) rows.set(params[0], { id: params[0], public_key: params[1], private_key: params[2] });
        return { rows: [] };
      }
      throw new Error(`unexpected query ${sql}`);
    },
  };
}

const manifest = { name: 'Tip calculator', description: 'Split a bill and tip across a crew.', icon: 'Toolbox', permissions: [] };
const good = '<div style="color: var(--ink)">Tip</div><script>censai.storage.set("x", 1)</script>';

test('every example and test module passes the module checks', async () => {
  const modules = [
    ...await readModuleDir(path.join(__dirname, '..', 'server', 'modules', 'examples')),
    ...await readModuleDir(path.join(__dirname, 'fixtures', 'modules')),
  ];
  expect(modules.length).toBeGreaterThanOrEqual(10);
  for (const m of modules) {
    const checks = runModuleChecks(m);
    expect({ id: m.id, failed: checks.results.filter(r => !r.passed).map(r => r.id) }).toEqual({ id: m.id, failed: [] });
    expect(checks.passed).toBe(true);
  }
});

test('a module that calls the network or an agent without asking fails a required check', () => {
  const sneaky = runModuleChecks({ manifest, source: `${good}<script>fetch("https://x.test")</script>` });
  expect(sneaky.passed).toBe(false);
  expect(sneaky.results.find(r => r.id === 'network-declared')).toMatchObject({ passed: false, required: true });
  const declared = runModuleChecks({ manifest: { ...manifest, permissions: ['network'] }, source: `${good}<script>fetch("https://x.test")</script>` });
  expect(declared.passed).toBe(true);

  const agent = runModuleChecks({ manifest, source: `${good}<script>censai.agent.ask("hi")</script>` });
  expect(agent.results.find(r => r.id === 'agent-declared').passed).toBe(false);
  expect(agent.passed).toBe(false);
});

test('reaching outside the sandbox or loading outside code is never listed', () => {
  expect(runModuleChecks({ manifest, source: `${good}<script>top.location = "https://evil.test"</script>` }).passed).toBe(false);
  expect(runModuleChecks({ manifest, source: `${good}<script src="https://cdn.test/x.js"></script>` }).passed).toBe(false);
});

test('soft checks lower the score but a module can still pass at 80%', () => {
  const checks = runModuleChecks({ manifest: { ...manifest, description: '' }, source: good }, { now: new Date('2026-10-08T06:00:00Z') });
  expect(checks.score).toBe(checks.total - 1);
  expect(checks.passed).toBe(true);
  expect(checks.ranAt).toBe('2026-10-08T06:00:00.000Z');
  const sloppy = runModuleChecks({ manifest: { ...manifest, description: '' }, source: '<div style="color:#f00;background:#0f0">x</div><script>localStorage.x=1</script>' });
  expect(sloppy.passed).toBe(false);
});

test('prohibited uses are refused whatever the score', () => {
  expect(prohibitedUse('Partner tracker', 'Track my girlfriend without her knowing')).toBe('surveillance');
  expect(prohibitedUse('Phishing page builder')).toBe('financial fraud');
  expect(prohibitedUse('Tip calculator', 'Split a bill')).toBeNull();
  const preview = previewModuleListing({ manifest: { ...manifest, name: 'Jailbreak helper' }, source: good });
  expect(preview.refused).toBe('getting around AI safety');
});

test('a name one letter off, or with look-alike characters, is too close', () => {
  expect(namesTooClose('Tip calculator', 'Tip calcu1ator')).toBe(true);
  expect(namesTooClose('Tip calculator', 'Tip calculators')).toBe(true);
  expect(namesTooClose('Flash cards', 'FIash cards')).toBe(true);
  expect(namesTooClose('Tip calculator', 'Unit converter')).toBe(false);
});

test('the fingerprint covers exactly what the buyer runs', () => {
  const a = fingerprint(moduleCard({ manifest, source: good }));
  expect(a).toMatch(/^[0-9a-f]{64}$/);
  expect(fingerprint(moduleCard({ manifest: { ...manifest }, source: good }))).toBe(a);
  expect(fingerprint(moduleCard({ manifest, source: `${good} ` }))).not.toBe(a);
  expect(fingerprint(moduleCard({ manifest: { ...manifest, permissions: ['agent'] }, source: good }))).not.toBe(a);
});

test('certificates are signed by Censai and break when anything in them changes', async () => {
  const db = keyDb();
  const checks = runModuleChecks({ manifest, source: good });
  const fp = fingerprint(moduleCard({ manifest, source: good }));
  const cert = await signCertificate(db, certificateBody({ listingId: 'l1', fingerprint: fp, sellerId: 1, checks, issuedAt: '2026-10-08T06:00:00Z' }));
  const { publicKey } = await signingKeys(db);
  expect(publicKey).toMatch(/BEGIN PUBLIC KEY/);
  // The private key is kept sealed, never as plain PEM.
  expect([...db.rows.values()][0].private_key).toMatch(/^v1:/);
  expect(verifyCertificate(publicKey, cert)).toBe(true);
  expect(verifyCertificate(publicKey, { ...cert, fingerprint: fp.replace(/^./, c => (c === 'a' ? 'b' : 'a')) })).toBe(false);
  expect(verifyCertificate(publicKey, { ...cert, score: '1/9' })).toBe(false);
  expect(verifyCertificate(publicKey, { ...cert, signature: undefined })).toBe(false);
});

test('the window and the server hash a module the same way', async () => {
  const win = { manifest: { ...manifest, size: { w: 400, h: 500 } }, source: good };
  expect(await browserModuleFingerprint(win)).toBe(fingerprint(moduleCard(win)));
});
