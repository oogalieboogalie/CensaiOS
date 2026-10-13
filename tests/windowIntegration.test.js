import {
  AUTH_MODES,
  CONNECTION_STATES,
  DANGER_LEVELS,
  DEFAULT_STATUS_LABELS,
  PERMISSION_SCOPES,
  isIntegrationManifest,
  validateIntegrationMetadata,
  normalizeIntegration,
  getStatusLabel,
  requiresAuth,
  compareDanger,
} from '../src/lib/windowIntegrationTypes.js';
import {
  WINDOW_MANIFESTS,
} from '../src/lib/windowManifest.js';

// A minimal, valid integration block used as a baseline for negative tests.
function baseIntegration(overrides = {}) {
  return {
    provider: { id: 'acme', name: 'Acme', category: 'developer-tools', docsUrl: 'https://acme.dev/docs' },
    authMode: AUTH_MODES.API_KEY,
    capabilities: ['read', 'write'],
    embedMode: 'native',
    dangerLevel: DANGER_LEVELS.LOW,
    defaultPermissions: [PERMISSION_SCOPES.READ, PERMISSION_SCOPES.WRITE],
    statusLabels: { connected: 'Linked to Acme' },
    ...overrides,
  };
}

describe('validateIntegrationMetadata', () => {
  test('a well-formed integration produces no errors', () => {
    const { errors } = validateIntegrationMetadata(baseIntegration());
    expect(errors).toEqual([]);
  });

  test('rejects a missing or non-object integration', () => {
    expect(validateIntegrationMetadata(null).errors.length).toBeGreaterThan(0);
    expect(validateIntegrationMetadata([]).errors.length).toBeGreaterThan(0);
    expect(validateIntegrationMetadata('nope').errors.length).toBeGreaterThan(0);
  });

  test('requires a provider object with slug id and name', () => {
    expect(validateIntegrationMetadata(baseIntegration({ provider: undefined })).errors.length).toBeGreaterThan(0);
    expect(validateIntegrationMetadata(baseIntegration({ provider: { id: 'Acme Corp', name: 'Acme' } })).errors)
      .toEqual(expect.arrayContaining([expect.stringContaining('provider.id')]));
    expect(validateIntegrationMetadata(baseIntegration({ provider: { id: 'acme' } })).errors)
      .toEqual(expect.arrayContaining([expect.stringContaining('provider.name')]));
  });

  test('rejects a non-http(s) docsUrl', () => {
    const { errors } = validateIntegrationMetadata(baseIntegration({ provider: { id: 'acme', name: 'Acme', docsUrl: 'ftp://acme.dev' } }));
    expect(errors).toEqual(expect.arrayContaining([expect.stringContaining('docsUrl')]));
  });

  test('rejects unknown authMode and embedMode', () => {
    expect(validateIntegrationMetadata(baseIntegration({ authMode: 'magic' })).errors)
      .toEqual(expect.arrayContaining([expect.stringContaining('authMode')]));
    expect(validateIntegrationMetadata(baseIntegration({ embedMode: 'hologram' })).errors)
      .toEqual(expect.arrayContaining([expect.stringContaining('embedMode')]));
  });

  test('rejects unknown dangerLevel', () => {
    expect(validateIntegrationMetadata(baseIntegration({ dangerLevel: 'spicy' })).errors)
      .toEqual(expect.arrayContaining([expect.stringContaining('dangerLevel')]));
  });

  test('rejects unknown permission scopes and non-array capabilities', () => {
    expect(validateIntegrationMetadata(baseIntegration({ defaultPermissions: ['read', 'teleport'] })).errors)
      .toEqual(expect.arrayContaining([expect.stringContaining('teleport')]));
    expect(validateIntegrationMetadata(baseIntegration({ capabilities: 'read' })).errors)
      .toEqual(expect.arrayContaining([expect.stringContaining('capabilities')]));
  });

  test('rejects empty statusLabel values', () => {
    const { errors } = validateIntegrationMetadata(baseIntegration({ statusLabels: { connected: '' } }));
    expect(errors).toEqual(expect.arrayContaining([expect.stringContaining('statusLabels.connected')]));
  });

  test('warns (not errors) on unknown capability and category', () => {
    const { errors, warnings } = validateIntegrationMetadata(baseIntegration({
      capabilities: ['read', 'telepathy'],
      provider: { id: 'acme', name: 'Acme', category: 'wizardry' },
    }));
    expect(errors).toEqual([]);
    expect(warnings).toEqual(expect.arrayContaining([
      expect.stringContaining('telepathy'),
      expect.stringContaining('wizardry'),
    ]));
  });

  test('warns when authMode none grants elevated permissions', () => {
    const { errors, warnings } = validateIntegrationMetadata(baseIntegration({
      authMode: AUTH_MODES.NONE,
      defaultPermissions: [PERMISSION_SCOPES.WRITE],
      dangerLevel: DANGER_LEVELS.ELEVATED,
    }));
    expect(errors).toEqual([]);
    expect(warnings).toEqual(expect.arrayContaining([expect.stringContaining('without authentication')]));
  });

  test('warns when destructive permissions carry a low danger level', () => {
    const { warnings } = validateIntegrationMetadata(baseIntegration({
      defaultPermissions: [PERMISSION_SCOPES.DELETE],
      dangerLevel: DANGER_LEVELS.LOW,
    }));
    expect(warnings).toEqual(expect.arrayContaining([expect.stringContaining('looks low')]));
  });
});

describe('isIntegrationManifest', () => {
  test('true only when an integration object is present', () => {
    expect(isIntegrationManifest({ integration: { provider: {} } })).toBe(true);
    expect(isIntegrationManifest({ kind: 'chat' })).toBe(false);
    expect(isIntegrationManifest(null)).toBe(false);
    expect(isIntegrationManifest({ integration: 'x' })).toBe(false);
  });
});

describe('normalizeIntegration', () => {
  test('fills defaults and merges status labels without mutating input', () => {
    const input = { provider: { id: 'acme', name: 'Acme' }, authMode: AUTH_MODES.OAUTH2, statusLabels: { connected: 'Linked' } };
    const norm = normalizeIntegration(input);
    expect(norm.embedMode).toBe('native');
    expect(norm.dangerLevel).toBe(DANGER_LEVELS.LOW);
    expect(norm.capabilities).toEqual([]);
    expect(norm.defaultPermissions).toEqual([]);
    expect(norm.statusLabels.connected).toBe('Linked');
    expect(norm.statusLabels.disconnected).toBe(DEFAULT_STATUS_LABELS.disconnected);
    // input untouched
    expect(input.statusLabels).toEqual({ connected: 'Linked' });
    expect(input.embedMode).toBeUndefined();
  });

  test('returns null for non-objects', () => {
    expect(normalizeIntegration(null)).toBeNull();
    expect(normalizeIntegration(42)).toBeNull();
  });
});

describe('getStatusLabel / requiresAuth / compareDanger', () => {
  test('getStatusLabel prefers provider override, then default, then raw state', () => {
    const integration = { statusLabels: { connected: 'Linked to Acme' } };
    expect(getStatusLabel(integration, CONNECTION_STATES.CONNECTED)).toBe('Linked to Acme');
    expect(getStatusLabel(integration, CONNECTION_STATES.DISCONNECTED)).toBe(DEFAULT_STATUS_LABELS.disconnected);
    expect(getStatusLabel(integration, 'mystery')).toBe('mystery');
  });

  test('requiresAuth is false only for authMode none', () => {
    expect(requiresAuth({ authMode: AUTH_MODES.NONE })).toBe(false);
    expect(requiresAuth({ authMode: AUTH_MODES.API_KEY })).toBe(true);
    expect(requiresAuth(null)).toBe(false);
  });

  test('compareDanger orders by tier', () => {
    expect(compareDanger(DANGER_LEVELS.SAFE, DANGER_LEVELS.CRITICAL)).toBeLessThan(0);
    expect(compareDanger(DANGER_LEVELS.HIGH, DANGER_LEVELS.LOW)).toBeGreaterThan(0);
    expect(compareDanger(DANGER_LEVELS.LOW, DANGER_LEVELS.LOW)).toBe(0);
  });
});

describe('manifest integration wiring', () => {
  test('every manifest that declares integration metadata is valid', () => {
    for (const manifest of WINDOW_MANIFESTS) {
      if (!isIntegrationManifest(manifest)) continue;
      const { errors } = validateIntegrationMetadata(manifest.integration, { label: manifest.kind });
      expect(errors).toEqual([]);
    }
  });

  // providerConnect was descoped (commented out in integrationWindows.js).
  // Tests for it were removed; if the feature returns, re-add them.
});
