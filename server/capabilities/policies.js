/**
 * Capability policy registry.
 *
 * Each entry maps a capability name to its description and the actions (route
 * paths or command IDs) that require it. This file is informational —
 * `server/capabilities/checkCapability.js` is the source of truth for which
 * roles actually receive a capability. Adding a capability here without
 * granting it to a role does nothing; the capability just stays unused.
 *
 * The frozen shape lets tests and audit scripts introspect the policy surface
 * without needing to import role tables.
 */

const CAPABILITY_POLICIES = Object.freeze({
  'window.import.validate': Object.freeze({
    description:
      'Run the LLM adaptation + static analysis pass for a generated window. ' +
      'No filesystem writes; safe for normal users to dry-run.',
    requiredFor: Object.freeze([
      'POST /api/windows/import (dry_run=true)',
      'command: window.import.validate',
    ]),
  }),

  'window.import.write': Object.freeze({
    description:
      'Persist an adapted window to disk and trigger window:sync. ' +
      'Touches src/components/windows/<kind>/ and runs scripts/window-sync.mjs. ' +
      'Admin-only because it adds executable code to the project.',
    requiredFor: Object.freeze([
      'POST /api/windows/import (dry_run=false)',
    ]),
  }),

  'filesystem.write': Object.freeze({
    description:
      'Write files anywhere in the project tree outside the dedicated ' +
      'window-import surface. Admin-only by design.',
    requiredFor: Object.freeze([
      'admin-only filesystem mutations outside window.import.write',
    ]),
  }),

  'command.execute': Object.freeze({
    description:
      'Invoke arbitrary server-side commands that may run shell processes ' +
      'or mutate the database. Admin-only.',
    requiredFor: Object.freeze([
      'POST /api/commands/*/execute (non-window-import commands)',
    ]),
  }),

  'credential.write': Object.freeze({
    description:
      'Create, rotate, or delete credentials (BYOK keys, OAuth tokens, ' +
      'mailcow credentials). Admin-only — touches secrets at rest.',
    requiredFor: Object.freeze([
      'BYOK key rotation',
      'OAuth store mutations',
      'Mailcow credential writes',
    ]),
  }),

  'provider.invoke': Object.freeze({
    description:
      'Invoke external provider integrations (mailcow, vex, etc.) on behalf ' +
      'of a user. Admin-only because it forwards credentials.',
    requiredFor: Object.freeze([
      'provider invocation routes under /api/providers',
    ]),
  }),
});

export default CAPABILITY_POLICIES;
export { CAPABILITY_POLICIES };