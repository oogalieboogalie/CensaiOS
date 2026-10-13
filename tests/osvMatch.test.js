import { affectedPackages, affectsVersion, osvEcosystem, versionInRange } from '../server/osvMirror/match.js';
import { DOMPURIFY_LAST_AFFECTED, DOMPURIFY_WINDOW, LODASH_COMMAND_INJECTION } from './fixtures/osvRecords.js';

const npm = (name, version) => ({ ecosystem: 'npm', name, version });

describe('OSV version matching', () => {
  test('introduced/fixed ranges include the lower bound and exclude the fix', () => {
    expect(affectsVersion(LODASH_COMMAND_INJECTION, npm('lodash', '4.17.15'))).toBe(true);
    expect(affectsVersion(LODASH_COMMAND_INJECTION, npm('lodash', '4.17.20'))).toBe(true);
    expect(affectsVersion(LODASH_COMMAND_INJECTION, npm('lodash', '4.17.21'))).toBe(false);
    expect(affectsVersion(DOMPURIFY_WINDOW, npm('dompurify', '3.4.12'))).toBe(false);
    expect(affectsVersion(DOMPURIFY_WINDOW, npm('dompurify', '3.4.13'))).toBe(true);
    expect(affectsVersion(DOMPURIFY_WINDOW, npm('dompurify', '3.4.16'))).toBe(false);
  });

  test('last_affected is inclusive', () => {
    expect(affectsVersion(DOMPURIFY_LAST_AFFECTED, npm('dompurify', '3.4.11'))).toBe(true);
    expect(affectsVersion(DOMPURIFY_LAST_AFFECTED, npm('dompurify', '3.4.12'))).toBe(false);
  });

  test('only matches the named package in the named ecosystem', () => {
    expect(affectsVersion(LODASH_COMMAND_INJECTION, npm('underscore', '1.0.0'))).toBe(false);
    expect(affectsVersion(LODASH_COMMAND_INJECTION, { ecosystem: 'pypi', name: 'lodash', version: '4.17.15' })).toBe(false);
  });

  test('non-semver ecosystems use the explicit versions list', () => {
    const gem = { ecosystem: 'RubyGems', name: 'lodash-rails' };
    expect(affectsVersion(LODASH_COMMAND_INJECTION, { ...gem, version: '4.17.15' })).toBe(true);
    expect(affectsVersion(LODASH_COMMAND_INJECTION, { ...gem, version: '4.17.20' })).toBe(false);
  });

  test('withdrawn advisories never match', () => {
    expect(affectsVersion({ ...LODASH_COMMAND_INJECTION, withdrawn: '2026-01-01T00:00:00Z' }, npm('lodash', '4.17.15'))).toBe(false);
  });

  test('unevaluable ranges return null rather than guessing', () => {
    expect(versionInRange('1.0.0', { type: 'GIT', events: [{ introduced: 'abc123' }] })).toBeNull();
    expect(versionInRange('not-a-version', { type: 'SEMVER', events: [{ introduced: '0' }] })).toBeNull();
  });

  test('indexes each distinct ecosystem/package pair and normalizes ecosystem names', () => {
    expect(affectedPackages(LODASH_COMMAND_INJECTION)).toEqual([
      { ecosystem: 'npm', name: 'lodash' },
      { ecosystem: 'npm', name: 'lodash-es' },
      { ecosystem: 'npm', name: 'lodash.template' },
      { ecosystem: 'RubyGems', name: 'lodash-rails' },
    ]);
    expect(osvEcosystem('pypi')).toBe('PyPI');
    expect(osvEcosystem('npm')).toBe('npm');
  });
});
