import crypto from 'crypto';

const MAX_CARD_CHARS = 256_000;
const MAX_SKILLS = 64;

export class A2AAdapterError extends Error {
  constructor(message, code = 'A2A_CARD_INVALID', statusCode = 422) {
    super(message);
    this.name = 'A2AAdapterError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new A2AAdapterError(`${label} must be an object.`);
  }
  return value;
}

function text(value, label, max = 500) {
  const result = String(value || '').trim();
  if (!result) throw new A2AAdapterError(`${label} is required.`);
  if (result.length > max) throw new A2AAdapterError(`${label} is too long.`);
  return result;
}

function endpoint(value, label) {
  let parsed;
  try { parsed = new URL(text(value, label, 2048)); }
  catch { throw new A2AAdapterError(`${label} must be an absolute URL.`); }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new A2AAdapterError(`${label} must be an HTTP(S) URL without embedded credentials.`);
  }
  parsed.hash = '';
  return parsed.toString();
}

function normalizeTransport(value) {
  return String(value || 'JSONRPC').toUpperCase().replace(/[^A-Z0-9+]/g, '');
}

function normalizeSkills(input) {
  if (!Array.isArray(input) || input.length === 0 || input.length > MAX_SKILLS) {
    throw new A2AAdapterError(`skills must contain 1-${MAX_SKILLS} entries.`);
  }
  return input.map((item, index) => {
    const skill = object(item, `skills[${index}]`);
    const tags = skill.tags == null ? [] : skill.tags;
    if (!Array.isArray(tags) || tags.length > 32) {
      throw new A2AAdapterError(`skills[${index}].tags must be a bounded array.`);
    }
    return {
      id: text(skill.id, `skills[${index}].id`, 160),
      name: text(skill.name, `skills[${index}].name`, 160),
      description: text(skill.description, `skills[${index}].description`, 1000),
      tags: tags.map((tag) => text(tag, `skills[${index}].tags`, 80)),
      ...(Array.isArray(skill.inputModes) ? { inputModes: skill.inputModes.slice(0, 16).map(String) } : {}),
      ...(Array.isArray(skill.outputModes) ? { outputModes: skill.outputModes.slice(0, 16).map(String) } : {}),
    };
  });
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

function isTextMode(value) {
  return ['text', 'text/plain'].includes(String(value || '').toLowerCase());
}

function requiresAuthentication(card) {
  return Array.isArray(card.security)
    && card.security.some((entry) => entry && Object.keys(entry).length > 0);
}

function inspectV03(card) {
  const preferred = normalizeTransport(card.preferredTransport);
  const interfaces = [
    { transport: preferred, url: card.url },
    ...(Array.isArray(card.additionalInterfaces) ? card.additionalInterfaces : []),
  ];
  const selected = interfaces.find((entry) => normalizeTransport(entry?.transport) === 'JSONRPC');
  const inputModes = Array.isArray(card.defaultInputModes) ? card.defaultInputModes : [];
  const outputModes = Array.isArray(card.defaultOutputModes) ? card.defaultOutputModes : [];
  if (!selected?.url) throw new A2AAdapterError('A2A v0.3 card has no JSON-RPC interface.');
  if (!inputModes.some(isTextMode) || !outputModes.some(isTextMode)) {
    throw new A2AAdapterError('A2A agent must accept and return text.');
  }
  if (requiresAuthentication(card)) {
    throw new A2AAdapterError('Authenticated A2A agents are not supported in this beta slice.',
      'A2A_AUTH_UNSUPPORTED');
  }
  return { executable: true, endpoint: endpoint(selected.url, 'A2A JSON-RPC endpoint') };
}

function inspectV1(card) {
  if (!Array.isArray(card.supportedInterfaces) || card.supportedInterfaces.length === 0) {
    throw new A2AAdapterError('A2A v1 card requires supportedInterfaces.');
  }
  const selected = card.supportedInterfaces.find((entry) => (
    normalizeTransport(entry?.protocolBinding).includes('JSONRPC')
  )) || card.supportedInterfaces[0];
  return {
    executable: false,
    endpoint: endpoint(selected.url, 'A2A v1 interface'),
    reason: 'A2A v1 execution awaits a stable official JavaScript client.',
  };
}

export function inspectA2ACard(raw, { cardUrl } = {}) {
  const serialized = JSON.stringify(raw);
  if (!serialized || serialized.length > MAX_CARD_CHARS) {
    throw new A2AAdapterError('A2A Agent Card is empty or too large.', 'A2A_CARD_SIZE_INVALID');
  }
  const card = object(raw, 'Agent Card');
  const name = text(card.name, 'name', 160);
  const description = text(card.description, 'description', 2000);
  const version = text(card.version, 'version', 80);
  const skills = normalizeSkills(card.skills);
  const isV1 = Array.isArray(card.supportedInterfaces);
  const protocolVersion = isV1
    ? String(card.supportedInterfaces[0]?.protocolVersion || '1.0').trim()
    : text(card.protocolVersion, 'protocolVersion', 40);
  if (!isV1 && !/^0\.3(?:\.|$)/.test(protocolVersion)) {
    throw new A2AAdapterError(`A2A protocol ${protocolVersion} is not executable in this beta slice.`,
      'A2A_PROTOCOL_UNSUPPORTED');
  }
  const transport = isV1 ? inspectV1(card) : inspectV03(card);
  const canonical = JSON.stringify(stable(card));
  return {
    name, description, version, skills, protocolVersion,
    cardUrl: endpoint(cardUrl, 'Agent Card URL'),
    sourceCard: card,
    sourceDigest: crypto.createHash('sha256').update(canonical).digest('hex'),
    ...transport,
  };
}
