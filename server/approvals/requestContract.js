import crypto from 'node:crypto';

export const MAX_APPROVAL_ARGUMENT_BYTES = 64 * 1024;

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, sortValue(value[key])]));
}

export function sanitizeApprovalArguments(args) {
  if (!args || typeof args !== 'object' || Array.isArray(args)) {
    throw Object.assign(new Error('Approval arguments must be an object.'), {
      code: 'TOOL_APPROVAL_ARGUMENTS_INVALID', statusCode: 400,
    });
  }
  const clean = structuredClone(args);
  delete clean.__provenance;
  const serialized = JSON.stringify(clean);
  if (Buffer.byteLength(serialized, 'utf8') > MAX_APPROVAL_ARGUMENT_BYTES) {
    throw Object.assign(new Error('Approval arguments exceed the 64 KiB private-beta limit.'), {
      code: 'TOOL_APPROVAL_ARGUMENTS_TOO_LARGE', statusCode: 413,
    });
  }
  return clean;
}

export function approvalRequestHash({ moduleId, toolName, args }) {
  const stable = JSON.stringify(sortValue({ moduleId, toolName, args }));
  return crypto.createHash('sha256').update(stable).digest('hex');
}
