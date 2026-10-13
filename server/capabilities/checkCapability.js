const ROLE_CAPABILITIES = Object.freeze({
  admin: new Set(['*']),
  user: new Set([
    'workspace.read',
    'workspace.write',
    'artifact.read',
    'artifact.write',
    // P1-2: window.import is split into validate (dry-run, safe for users)
    // and write (admin-only). Normal users can run validation/preview but
    // cannot persist new windows to disk.
    'window.import.validate',
  ]),
});

export class CapabilityDeniedError extends Error {
  constructor(capability) {
    super(`Missing required capability: ${capability}`);
    this.name = 'CapabilityDeniedError';
    this.code = 'CAPABILITY_DENIED';
    this.statusCode = 403;
    this.capability = capability;
  }
}

export function hasCapability(context, capability) {
  const role = String(context?.userRole || 'user').trim().toLowerCase();
  const grants = ROLE_CAPABILITIES[role] || new Set();
  return grants.has('*') || grants.has(capability);
}

export function requireCapability(capability, context) {
  if (!hasCapability(context, capability)) {
    throw new CapabilityDeniedError(capability);
  }
}

export function checkCommandCapabilities(command, context) {
  for (const capability of command.requiredCapabilities || []) {
    requireCapability(capability, context);
  }
}
