function cleanPath(value) {
  return String(value || '').trim().replace(/\\/g, '/').replace(/^\/+/, '');
}

function list(value) {
  return Array.isArray(value) ? value.map(cleanPath).filter(Boolean) : [];
}

function matchesZone(file, zone) {
  const f = cleanPath(file);
  const z = cleanPath(zone);
  if (!f || !z) return false;
  if (z.endsWith('/**')) return f.startsWith(z.slice(0, -2));
  if (z.endsWith('/')) return f.startsWith(z);
  return f === z || f.startsWith(`${z}/`);
}

export function evaluatePrFilesAgainstContract({ changedFiles = [], contractFiles = [], forbiddenFiles = [] } = {}) {
  const changed = list(changedFiles);
  const allowed = list(contractFiles);
  const forbidden = list(forbiddenFiles);
  if (changed.length === 0 || allowed.length === 0) {
    return { ok: true, outsideFiles: [], forbiddenMatches: [] };
  }

  const outsideFiles = changed.filter(file => !allowed.some(zone => matchesZone(file, zone)));
  const forbiddenMatches = changed.filter(file => forbidden.some(zone => matchesZone(file, zone)));
  return {
    ok: outsideFiles.length === 0 && forbiddenMatches.length === 0,
    outsideFiles,
    forbiddenMatches,
  };
}

export function formatPrStewardBlock(result) {
  const lines = ['PR steward blocked completion: changed files violate the todo contract.'];
  if (result?.outsideFiles?.length) lines.push(`Outside contract: ${result.outsideFiles.join(', ')}`);
  if (result?.forbiddenMatches?.length) lines.push(`Forbidden files: ${result.forbiddenMatches.join(', ')}`);
  return lines.join('\n');
}
