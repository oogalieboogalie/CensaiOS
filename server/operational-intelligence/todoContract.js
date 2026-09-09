const FIELD_ALIASES = {
  files: ['files', 'file zones', 'file zone', 'touch'],
  forbidden: ['forbidden', 'do not touch', 'blocked files'],
  acceptance: ['acceptance', 'verify', 'verification', 'tests'],
  proof: ['proof', 'done when'],
};

function splitList(value) {
  if (Array.isArray(value)) return value.map(String).map(v => v.trim()).filter(Boolean);
  return String(value || '')
    .split(/\r?\n|,/)
    .map(v => v.replace(/^[-*]\s*/, '').trim())
    .filter(Boolean);
}

function aliasFor(label) {
  const normalized = String(label || '').trim().toLowerCase();
  return Object.entries(FIELD_ALIASES)
    .find(([, aliases]) => aliases.includes(normalized))?.[0] || null;
}

function parseTextFields(text) {
  const result = {};
  for (const line of String(text || '').split(/\r?\n/)) {
    const match = line.match(/^\s*(files?|file zones?|touch|forbidden|do not touch|blocked files|acceptance|verify|verification|tests|proof|done when)\s*:\s*(.+)$/i);
    const key = match ? aliasFor(match[1]) : null;
    if (!key) continue;
    result[key] = [...(result[key] || []), ...splitList(match[2])];
  }
  return result;
}

function firstList(...values) {
  for (const value of values) {
    const list = splitList(value);
    if (list.length > 0) return list;
  }
  return [];
}

export function normalizeTodoContract(item = {}) {
  const embedded = item.contract && typeof item.contract === 'object' ? item.contract : {};
  const parsed = parseTextFields(item.text);
  const files = firstList(item.files, item.fileZones, item.file_zones, embedded.files, parsed.files);
  const acceptance = firstList(
    item.acceptance,
    item.acceptanceCommands,
    item.acceptance_commands,
    embedded.acceptance,
    embedded.acceptanceCommands,
    parsed.acceptance
  );
  const forbidden = firstList(item.forbidden, item.forbiddenFiles, embedded.forbidden, parsed.forbidden);
  const proof = firstList(item.proof, embedded.proof, parsed.proof);
  const missing = [];
  if (files.length === 0) missing.push('files');
  if (acceptance.length === 0) missing.push('acceptance');

  return {
    files,
    forbidden,
    acceptance,
    proof,
    missing,
    ready: missing.length === 0,
  };
}

export function contractWarning(contract) {
  if (!contract?.missing?.length) return '';
  return `Needs contract: ${contract.missing.join(', ')}. Add Files: and Acceptance: lines before dispatch.`;
}
