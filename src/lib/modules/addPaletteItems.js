// Spec 6: what the Add palette lists. Pure data so it can be tested: the
// palette component turns each item's `action` into a spawn.
//
// Sections, top to bottom: Recent, My modules, every built-in module by
// category, Templates, and always a last row "Make a new module…". When a
// search matches nothing, "Make a new module: <search>" moves to the top.

import { DEFAULT_HTML_PREVIEW } from '../../components/canvas/CanvasState.js';

export const CATEGORIES = Object.freeze([
  { label: 'Chat and agents', kinds: ['chat', 'groupChat', 'agentDesigner', 'rook', 'exoSkeleton'] },
  { label: 'Work', kinds: ['todos', 'workflow', 'scheduler', 'operationsBoard', 'julesTasks', 'calendar', 'leadHound', 'leads'] },
  { label: 'Build', kinds: ['terminal', 'code_editor', 'files', 'doc', 'htmlPreview', 'browser', 'designBlock'] },
  { label: 'Create', kinds: ['genImage', 'imageStudio', 'idea', 'analyticsBoard'] },
  { label: 'Media', kinds: ['music', 'stream'] },
  { label: 'System', kinds: ['mailcow', 'vex', 'sovereignTest', 'marketplace'] },
]);

// Kinds never added from the palette: agents come from the designer, groups
// from a marquee, todo is a legacy alias, module needs a request.
export const EXCLUDED_KINDS = new Set(['agent', 'group', 'todo', 'generic', 'chrome', 'module']);

// Fallback icons for manifests that don't name one (names from Icons.jsx).
const ICON_BY_KIND = {
  chat: 'Chat', groupChat: 'Group', agentDesigner: 'NewAgent', rook: 'Bot', exoSkeleton: 'Bot',
  todos: 'List', workflow: 'NewWorkflow', scheduler: 'Calendar', operationsBoard: 'Tools',
  julesTasks: 'List', calendar: 'Calendar', terminal: 'Terminal', code_editor: 'Code', files: 'Files',
  doc: 'Files', htmlPreview: 'Eye', browser: 'Search', genImage: 'Picture', imageStudio: 'Picture',
  idea: 'Flask', analyticsBoard: 'Activity', music: 'Music', stream: 'Video', mailcow: 'Mail',
  vex: 'Bot', sovereignTest: 'Shield',
};

// Default props for kinds that need a sensible seed when spawned.
export const PROPS_BY_KIND = Object.freeze({
  chat: { agentId: 'censai' },
  terminal: { title: 'Terminal' },
  htmlPreview: { title: 'Shared Preview', fileName: 'preview.html', html: DEFAULT_HTML_PREVIEW },
  rook: { title: 'Rook Agent Control' },
  mailcow: { title: 'Mailcow' },
  vex: { title: 'Vex Orchestrator' },
});

export function manifestIcon(manifest) {
  return manifest?.launcher?.icon || manifest?.moduleMenu?.icon || manifest?.header?.icon || ICON_BY_KIND[manifest?.kind] || 'NewWindow';
}

export function matches(query, ...fields) {
  const words = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = fields.filter(Boolean).join(' ').toLowerCase();
  return words.every(w => hay.includes(w));
}

function builtInItems(manifests) {
  const byKind = new Map(manifests.filter(m => !EXCLUDED_KINDS.has(m.kind)).map(m => [m.kind, m]));
  const claimed = new Set();
  const groups = CATEGORIES.map(cat => ({
    label: cat.label,
    manifests: cat.kinds.map(k => byKind.get(k)).filter(Boolean).map(m => { claimed.add(m.kind); return m; }),
  }));
  const rest = [...byKind.values()].filter(m => !claimed.has(m.kind)).sort((a, b) => a.label.localeCompare(b.label));
  if (rest.length) groups.push({ label: 'More', manifests: rest });
  return groups.map(g => ({
    label: g.label,
    items: g.manifests.map(m => ({
      id: `kind:${m.kind}`,
      label: m.label,
      hint: m.moduleMenu?.hint || m.launcher?.hint || '',
      icon: manifestIcon(m),
      action: { type: 'spawn', kind: m.kind },
    })),
  }));
}

/**
 * sections for the palette.
 *   manifests  window manifests (visible in the module menu)
 *   recent     ids of recently added items, newest first
 *   saved      [{ id, name, manifest }] from My modules
 *   templates  [{ id, request, manifest }] example modules
 *   mode       'search' or 'describe' (after picking "Make a new module…")
 */
export function buildAddSections({ query = '', manifests = [], recent = [], saved = [], templates = [], mode = 'search' }) {
  const q = String(query || '').trim();
  if (mode === 'describe') {
    return [{
      id: 'make', label: 'Make a new module',
      items: [{ id: 'make:new', label: q ? `Make a new module: ${q}` : 'Describe the module you want, then press Enter', icon: 'Plus', action: q ? { type: 'make', request: q } : { type: 'noop' }, keepOpen: !q }],
    }];
  }

  const builtIns = builtInItems(manifests);
  const savedItems = saved.map(s => ({
    id: `saved:${s.id}`, label: s.name || s.manifest?.name || 'Module', hint: s.manifest?.description || 'My module',
    icon: s.manifest?.icon || 'Toolbox', action: { type: 'saved', id: s.id },
  }));
  const templateItems = templates.map(t => ({
    id: `template:${t.id}`, label: t.manifest?.name || t.id, hint: t.manifest?.description || '',
    icon: t.manifest?.icon || 'Toolbox', action: { type: 'template', id: t.id },
  }));
  const everything = [...savedItems, ...builtIns.flatMap(g => g.items), ...templateItems];
  const byId = new Map(everything.map(i => [i.id, i]));
  const filter = items => items.filter(i => matches(q, i.label, i.hint, i.id));

  const make = q
    ? { id: 'make:query', label: `Make a new module: ${q}`, hint: 'Built in a sandbox', icon: 'Plus', action: { type: 'make', request: q } }
    : { id: 'make:describe', label: 'Make a new module…', hint: 'Describe it in plain words', icon: 'Plus', action: { type: 'describe' }, keepOpen: true };

  const sections = [];
  if (!q) {
    const recentItems = recent.map(id => byId.get(id)).filter(Boolean).slice(0, 4);
    if (recentItems.length) sections.push({ id: 'recent', label: 'Recent', items: recentItems });
  }
  sections.push({ id: 'mine', label: 'My modules', items: filter(savedItems) });
  for (const group of builtIns) sections.push({ id: `cat:${group.label}`, label: group.label, items: filter(group.items) });
  sections.push({ id: 'templates', label: 'Templates', items: filter(templateItems) });

  const anyMatch = sections.some(s => s.items.length > 0);
  if (q && !anyMatch) return [{ id: 'make', label: 'No module does that yet', items: [make] }];
  sections.push({ id: 'make', label: '', items: [make] });
  return sections;
}
