// Module manifest v3: the one label every module carries, first-party or
// generated. It says what the module is (id, name, version, author), the
// window it opens, what it may do (permissions), and the tools it offers
// agents ("chat to module"). Sealed modules run in a sandboxed iframe and get
// only what their label declares; built-in windows carry a v3 label too, with
// `runs: 'app'`, because they need the app itself (terminal, files, Docker).
//
// v3 is a superset of the v1 module manifest (name, description, icon, size,
// permissions), so code that reads the old fields keeps working, and a v1
// manifest upgrades to v3 without losing anything (see upgradeManifest).
//
// Guide in plain words: docs/modules/manifest-v3.md

export const MANIFEST_VERSION = 3;

// What a sealed module may ask for. Theme, toast and resize are always on:
// they can't leave the module's own window.
export const V3_PERMISSIONS = Object.freeze(['storage', 'presence', 'agent', 'network']);

export const V3_PERMISSION_LABELS = Object.freeze({
  storage: 'Save its data on the board',
  presence: 'See who is on the board',
  agent: 'Ask your agents (uses your model key)',
  network: 'Use the internet',
});

// v1 modules always had storage and presence, so an upgraded one keeps them.
const V1_IMPLIED = Object.freeze(['storage', 'presence']);

export const RUNS_SEALED = 'sealed';
export const RUNS_APP = 'app';

export const MAX_TOOLS = 12;
export const MAX_NETWORK_HOSTS = 8;
export const TOOL_NAME = /^[a-z][a-z0-9_]{0,39}$/;
const INPUT_TYPES = Object.freeze(['string', 'number', 'integer', 'boolean', 'array', 'object']);
// "any website" for an upgraded v1 module that asked for the network.
export const ANY_HOST = '*';

function cleanText(value, max) {
  const spaced = String(value ?? '').replace(/\s+/g, ' ');
  return Array.from(spaced).filter(ch => ch.charCodeAt(0) >= 32).join('').trim().slice(0, max);
}

/** "Tip calculator" -> "tip-calculator". */
export function moduleIdFromName(name) {
  const id = String(name || '').normalize('NFKD').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
  return id || 'module';
}

/** "1", "1.2" or "1.2.3" -> "1.2.3"; anything else -> "1.0.0". */
export function cleanVersion(value) {
  const match = String(value ?? '').trim().match(/^v?(\d{1,4})(?:\.(\d{1,4}))?(?:\.(\d{1,4}))?$/);
  if (!match) return '1.0.0';
  return [match[1], match[2] || '0', match[3] || '0'].map(Number).join('.');
}

/** A web host a module may reach: "api.open-meteo.com". Paths and schemes are dropped. */
export function cleanHost(value) {
  const raw = String(value ?? '').trim().toLowerCase();
  if (raw === ANY_HOST) return ANY_HOST;
  const host = raw.replace(/^[a-z]+:\/\//, '').split(/[/?#]/)[0];
  if (!/^(\*\.)?[a-z0-9-]+(\.[a-z0-9-]+)+(:\d{2,5})?$/.test(host)) return null;
  return host;
}

function cleanSchema(raw, depth = 0) {
  const input = raw && typeof raw === 'object' ? raw : {};
  const type = INPUT_TYPES.includes(input.type) ? input.type : 'string';
  const out = { type };
  const description = cleanText(input.description, 160);
  if (description) out.description = description;
  if (Array.isArray(input.enum)) out.enum = input.enum.slice(0, 24).map(v => (typeof v === 'number' ? v : cleanText(v, 60)));
  if (type === 'object' && depth < 2) {
    const props = input.properties && typeof input.properties === 'object' ? input.properties : {};
    out.properties = Object.fromEntries(Object.entries(props).slice(0, 16)
      .filter(([key]) => /^[a-zA-Z_][\w]{0,39}$/.test(key))
      .map(([key, value]) => [key, cleanSchema(typeof value === 'string' ? { type: value } : value, depth + 1)]));
    const required = Array.isArray(input.required) ? input.required.filter(k => k in out.properties) : [];
    if (required.length) out.required = required;
  }
  if (type === 'array' && depth < 2) out.items = cleanSchema(input.items || { type: 'string' }, depth + 1);
  return out;
}

/** A tool an agent can call on the module. Bad names drop the tool. */
export function cleanTool(raw) {
  const input = raw && typeof raw === 'object' ? raw : {};
  const name = String(input.name || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (!TOOL_NAME.test(name)) return null;
  // Shorthand: input: { address: 'string' } is a flat object of those fields.
  const rawInput = input.input && typeof input.input === 'object' && !input.input.type
    ? { type: 'object', properties: input.input }
    : (input.input || { type: 'object', properties: {} });
  const schema = cleanSchema({ ...rawInput, type: 'object' });
  return { name, description: cleanText(input.description, 200), input: schema };
}

function permissionList(input, { legacy }) {
  let list = input.permissions;
  // Object form: { storage: true, network: ['api.x.com'] }.
  if (list && typeof list === 'object' && !Array.isArray(list)) {
    list = Object.entries(list).filter(([, v]) => v === true || (Array.isArray(v) && v.length)).map(([k]) => k);
  }
  const names = (Array.isArray(list) ? list : []).map(p => String(p).trim().toLowerCase().split(':')[0]);
  const wanted = new Set(legacy ? [...V1_IMPLIED, ...names] : names);
  return V3_PERMISSIONS.filter(p => wanted.has(p));
}

function networkHosts(input, permissions, { legacy }) {
  if (!permissions.includes('network')) return [];
  const listed = [
    ...(Array.isArray(input.network) ? input.network : []),
    ...(Array.isArray(input.permissions?.network) ? input.permissions.network : []),
    ...(Array.isArray(input.permissions) ? input.permissions.filter(p => String(p).includes(':')).map(p => String(p).split(':').slice(1).join(':')) : []),
  ];
  const hosts = [...new Set(listed.map(cleanHost).filter(Boolean))].slice(0, MAX_NETWORK_HOSTS);
  // A v1 module's "network" meant any https site; keep that so it still works.
  if (!hosts.length && legacy) return [ANY_HOST];
  return hosts;
}

/** Is this raw manifest written for v3 (rather than the older module format)? */
export function isV3(raw) {
  return Number(raw?.manifest) === MANIFEST_VERSION;
}

/**
 * The v3 fields for any manifest, v1 or v3. `base` holds the already-cleaned
 * v1 fields (name, description, icon, size) so the module format stays the
 * single owner of those rules.
 */
export function v3Fields(raw, base = {}) {
  const input = raw && typeof raw === 'object' ? raw : {};
  const legacy = !isV3(input);
  const permissions = permissionList(input, { legacy });
  const network = networkHosts(input, permissions, { legacy });
  const tools = [];
  for (const tool of (Array.isArray(input.tools) ? input.tools : []).map(cleanTool)) {
    if (tool && !tools.some(t => t.name === tool.name) && tools.length < MAX_TOOLS) tools.push(tool);
  }
  const state = input.state && typeof input.state === 'object'
    ? Object.fromEntries(Object.entries(input.state).slice(0, 16).map(([k, v]) => [cleanText(k, 40), cleanText(v, 160)]).filter(([k]) => k))
    : {};
  return {
    manifest: MANIFEST_VERSION,
    id: moduleIdFromName(input.id || base.name),
    version: cleanVersion(input.version),
    author: cleanText(input.author, 60),
    runs: input.runs === RUNS_APP ? RUNS_APP : RUNS_SEALED,
    window: { size: base.size || null },
    permissions,
    network: permissions.includes('network') ? network : [],
    tools,
    ...(Object.keys(state).length ? { state } : {}),
  };
}

/** Plain-words lines for what a module may do, for the window and the guide. */
export function describePermissions(manifest) {
  const list = Array.isArray(manifest?.permissions) ? manifest.permissions : [];
  return list.map((p) => {
    if (p !== 'network') return V3_PERMISSION_LABELS[p] || p;
    const hosts = Array.isArray(manifest?.network) ? manifest.network : [];
    if (!hosts.length || hosts.includes(ANY_HOST)) return 'Use any website';
    return `Reach ${hosts.join(', ')}`;
  });
}

/** May this module use `permission`? Only what the label declares. */
export function declares(manifest, permission) {
  return Array.isArray(manifest?.permissions) && manifest.permissions.includes(permission);
}

/** The CSP connect-src list for a module's declared hosts. */
export function cspHosts(manifest) {
  if (!declares(manifest, 'network')) return [];
  const hosts = Array.isArray(manifest?.network) && manifest.network.length ? manifest.network : [ANY_HOST];
  if (hosts.includes(ANY_HOST)) return ['https:'];
  return hosts.map(h => `https://${h}`);
}

/** A declared tool by name, or null. */
export function findTool(manifest, name) {
  const tools = Array.isArray(manifest?.tools) ? manifest.tools : [];
  return tools.find(t => t.name === String(name || '').trim().toLowerCase()) || null;
}

/** The short form a person or model writes (what the guide and generator show). */
export function authoringManifest(m) {
  const out = {
    manifest: MANIFEST_VERSION,
    id: m.id,
    name: m.name,
    version: m.version,
    description: m.description,
    icon: m.icon,
    size: m.size || m.window?.size,
    permissions: m.permissions,
  };
  if (m.network?.length) out.network = m.network;
  if (m.tools?.length) out.tools = m.tools;
  if (m.state && Object.keys(m.state).length) out.state = m.state;
  return out;
}
