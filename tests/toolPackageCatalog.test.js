import {
  REVIEWED_TOOL_PACKAGES,
  TOOL_PACKAGE_SCHEMA,
  canonicalPackageJson,
  getToolPackageForModule,
  toolPackageManifestHash,
} from '../server/capabilities/packageCatalog.js';
import { AGENT_CAPABILITY_MODULES } from '../src/data/agent-capability-modules.js';

test('every reviewed module has one immutable workspace package manifest', () => {
  expect(REVIEWED_TOOL_PACKAGES).toHaveLength(AGENT_CAPABILITY_MODULES.length);
  expect(new Set(REVIEWED_TOOL_PACKAGES.map(pkg => pkg.id)).size).toBe(REVIEWED_TOOL_PACKAGES.length);
  for (const module of AGENT_CAPABILITY_MODULES) {
    const pkg = getToolPackageForModule(module.id);
    expect(pkg).toMatchObject({
      schemaVersion: TOOL_PACKAGE_SCHEMA,
      version: '1.0.0',
      installScope: 'workspace',
      publisher: { id: 'censai-core', name: 'Censai Core' },
      module: {
        id: module.id, capabilityId: module.capabilityId,
        risk: module.risk, mode: module.mode, tools: [...module.toolNames],
      },
    });
    expect(pkg.manifestHash).toMatch(/^[a-f0-9]{64}$/);
    const { manifestHash, ...payload } = pkg;
    expect(toolPackageManifestHash(payload)).toBe(manifestHash);
  }
});

test('canonical hashing ignores object key insertion order', () => {
  expect(canonicalPackageJson({ b: 2, a: { d: 4, c: 3 } }))
    .toBe(canonicalPackageJson({ a: { c: 3, d: 4 }, b: 2 }));
});
