// Real OSV records (trimmed to the fields the scanner reads), copied from
// osv-vulnerabilities.storage.googleapis.com on 2026-10-03.
export const LODASH_COMMAND_INJECTION = {
  id: 'GHSA-35jh-r3h4-6jhm',
  modified: '2026-09-10T03:49:04.067984836Z',
  summary: 'Command Injection in lodash',
  affected: [
    { package: { name: 'lodash', ecosystem: 'npm' }, ranges: [{ type: 'SEMVER', events: [{ introduced: '0' }, { fixed: '4.17.21' }] }] },
    { package: { name: 'lodash-es', ecosystem: 'npm' }, ranges: [{ type: 'SEMVER', events: [{ introduced: '0' }, { fixed: '4.17.21' }] }] },
    { package: { name: 'lodash.template', ecosystem: 'npm' }, ranges: [{ type: 'SEMVER', events: [{ introduced: '0' }, { last_affected: '4.5.0' }] }] },
    {
      package: { name: 'lodash-rails', ecosystem: 'RubyGems' },
      ranges: [{ type: 'ECOSYSTEM', events: [{ introduced: '0' }, { fixed: '4.17.21' }] }],
      versions: ['4.17.14', '4.17.15'],
    },
  ],
};

export const DOMPURIFY_LAST_AFFECTED = {
  id: 'GHSA-jxrp-r7gx-q4j8',
  modified: '2026-10-02T23:00:16.781604108Z',
  summary: 'DOMPurify: CUSTOM_ELEMENT_HANDLING bypasses afterSanitizeElements for allowed custom elements.',
  affected: [
    { package: { name: 'dompurify', ecosystem: 'npm' }, ranges: [{ type: 'SEMVER', events: [{ introduced: '0' }, { last_affected: '3.4.11' }] }] },
  ],
};

export const DOMPURIFY_WINDOW = {
  id: 'GHSA-p98j-92pf-mc4p',
  modified: '2026-10-01T00:00:00Z',
  summary: 'DOMPurify: IN_PLACE: node-removing afterSanitize hook leaves detached subtree event handlers armed, causing DOM XSS',
  affected: [
    { package: { name: 'dompurify', ecosystem: 'npm' }, ranges: [{ type: 'SEMVER', events: [{ introduced: '3.4.13' }, { fixed: '3.4.16' }] }] },
  ],
};
