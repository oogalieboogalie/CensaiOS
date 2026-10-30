// Spec 6: what the Add palette lists. Pure data so it can be tested: the
// palette component turns each item's `action` into a spawn.
//
// Sections, top to bottom: Recent, My modules, every built-in module by
// category, Ready-made boards, Templates, and always a last row "Make a new
// module…". A search puts rows named exactly what was typed first (Best
// match). A window is also found by the other names the board shows for it
// (addPaletteNames.js), listed after the rows whose own name or description
// holds what was typed. When a search matches nothing, "Make a new module:
// <search>" moves to the top.

import { DEFAULT_HTML_PREVIEW } from '../../components/canvas/CanvasState.js';
import { shownAs, startsWords, windowNames, withChipName } from './addPaletteNames.js';
import { OFFICE_STARTERS } from '../office/officeStarters.js';
import { CREATIVE_STARTERS } from '../creative/creativeStarters.js';
import { YORWARE_STARTERS } from '../yorware/yorwareStarters.js';
import { companyStarter } from '../weewoo/company.js';
import { NEW_VAULT_PROPS } from '../manifest/notesWindows.js';
import { BRAND_BY_KIND } from '../brands/index.js';
import { searchPaletteEntries } from '../search/engines.js';

export const CATEGORIES = Object.freeze([
  { label: 'Chat and agents', kinds: ['chat', 'agentList', 'groupChat', 'group', 'agentDesigner', 'weewoo', 'rook', 'exoSkeleton', 'modelArena', 'arenaBenchmarks'] },
  // Censai Office: spreadsheets and decks that export to real files.
  { label: 'Censai Office', kinds: ['officeSheets', 'officeSlides'] },
  // Censai Creative: picture, vector and video editors (the Adobe-style set).
  { label: 'Censai Creative', kinds: ['creativePhoto', 'creativeVector', 'creativeVideo'] },
  // YorWare Suite: open-source everyday apps (spec 13). Writer is the old
  // Censai Docs window (kind officeDocs) grown into the suite.
  { label: 'YorWare Suite', kinds: ['officeDocs', 'yorPdf', 'yorPhotos', 'yorLayout', 'yorDiagrams', 'yor3d', 'yorThreeEditor', 'yorCad', 'yorBooks'] },
  { label: 'Work', kinds: ['todos', 'workflow', 'scheduler', 'operationsBoard', 'julesTasks', 'calendar', 'leadHound', 'research', 'sheets', 'leads', 'blueprints', 'agentRouter'] },
  // One row per engine; each opens the Search window set to that engine
  // (Tavily opens Research). `entries` rows carry their own props.
  { label: 'Search engines', kinds: [], entries: searchPaletteEntries(), claims: ['searchEngine'] },
  { label: 'Build', kinds: ['terminal', 'code_editor', 'files', 'doc', 'vaultNotes', 'finderFiles', 'htmlPreview', 'browser', 'vm', 'designBlock', 'hosting'] },
  { label: 'Create', kinds: ['genImage', 'imageStudio', 'idea', 'analyticsBoard'] },
  { label: 'Teach', kinds: ['classroom'] },
  // Social canvas: follow boards and friends, a feed, your profile.
  { label: 'People', kinds: ['social'] },
  { label: 'Media', kinds: ['shorts', 'music', 'studio', 'humBeat', 'stream', 'teleprompter'] },
  { label: 'Games', kinds: ['asteroids', 'racetrack', 'agentCompany', 'idleBlocks', 'codeRobot', 'rhythmRun', 'driftholm', 'gamePlayground'] },
  { label: 'System', kinds: ['mailcow', 'vex', 'sovereignTest', 'marketplace'] },
]);

// Kinds never added from the palette: agents come from the designer, todo is
// a legacy alias, module needs a request. The Group window (team card) is
// listed; window groups themselves still come from a marquee.
export const EXCLUDED_KINDS = new Set(['agent', 'todo', 'generic', 'chrome', 'module']);

// Fallback icons for manifests that don't name one (names from Icons.jsx).
const ICON_BY_KIND = {
  chat: 'Chat', groupChat: 'Group', agentDesigner: 'NewAgent', rook: 'Bot', exoSkeleton: 'Bot',
  todos: 'List', workflow: 'NewWorkflow', scheduler: 'Calendar', operationsBoard: 'Tools',
  julesTasks: 'List', calendar: 'Calendar', terminal: 'Terminal', code_editor: 'Code', files: 'Files',
  doc: 'Files', vaultNotes: 'Files', finderFiles: 'Folder', htmlPreview: 'Eye', browser: 'Search', genImage: 'Picture', imageStudio: 'Picture',
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
  ...OFFICE_STARTERS,
  ...CREATIVE_STARTERS,
  ...YORWARE_STARTERS,
  weewoo: { ...companyStarter(), seeded: true },
  vaultNotes: NEW_VAULT_PROPS,
});

// Ready-made boards (spec 7): one pick lays out a whole board of windows,
// groups and agents next to what is already there.
export const BOARD_TEMPLATE_ITEMS = Object.freeze([
  { id: 'board:developer', label: 'Developer', hint: 'Ready-made board: code, preview, terminal and code review', icon: 'Group', cover: 'developerBoard', action: { type: 'boardTemplate', id: 'developer' } },
  { id: 'board:code-workspace', label: 'Code Workspace', hint: 'Ready-made board laid out like VS Code: files, code, terminal, AI side panel', icon: 'Group', cover: 'codeWorkspaceBoard', action: { type: 'boardTemplate', id: 'code-workspace' } },
  { id: 'board:creative-studio', label: 'Creative Studio', hint: 'Ready-made board: brief, design, video and a content calendar', icon: 'Group', cover: 'creativeBoard', action: { type: 'boardTemplate', id: 'creative-studio' } },
  { id: 'board:agent-team', label: 'Agent Team', hint: 'Ready-made board: four agents in one team room; the Lead hands out the work', icon: 'Group', cover: 'agentTeamBoard', action: { type: 'boardTemplate', id: 'agent-team' } },
  { id: 'board:small-business', label: 'Small Business', hint: 'Ready-made board: find customers, money sheet and this week', icon: 'Group', cover: 'smallBusinessBoard', action: { type: 'boardTemplate', id: 'small-business' } },
  { id: 'board:notes-workspace', label: 'Notes Workspace', hint: "Ready-made board: Obsidian-style vault over a Finder of the open project's files", icon: 'Files', cover: 'notesWorkspaceBoard', action: { type: 'boardTemplate', id: 'notes-workspace' } },
  { id: 'board:real-estate-team', label: 'Real Estate Team', hint: 'Ready-made board: listings, showings and follow-ups', icon: 'Group', cover: 'realEstateBoard', action: { type: 'boardTemplate', id: 'real-estate-team' } },
]);

export function manifestIcon(manifest) {
  return manifest?.launcher?.icon || manifest?.moduleMenu?.icon || manifest?.header?.icon || ICON_BY_KIND[manifest?.kind] || 'NewWindow';
}

export function matches(query, ...fields) {
  const words = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = fields.filter(Boolean).join(' ').toLowerCase();
  return words.every(w => hay.includes(w));
}

// A ready-made board is found by its chip's name on the empty board too.
const BOARD_ITEMS = BOARD_TEMPLATE_ITEMS.map(withChipName);

function builtInItem(m) {
  const names = windowNames(m);
  return {
    id: `kind:${m.kind}`,
    label: m.label,
    hint: m.moduleMenu?.hint || m.launcher?.hint || '',
    icon: manifestIcon(m),
    ...(BRAND_BY_KIND[m.kind] ? { brand: BRAND_BY_KIND[m.kind] } : {}),
    ...(names.length ? { names } : {}),
    // Every row shows a cover picture (components/covers), the style
    // the Games set started (spec 11); kinds without one keep the icon.
    cover: m.kind,
    action: { type: 'spawn', kind: m.kind },
  };
}

function builtInItems(manifests) {
  const byKind = new Map(manifests.filter(m => !EXCLUDED_KINDS.has(m.kind)).map(m => [m.kind, m]));
  const claimed = new Set();
  for (const cat of CATEGORIES) (cat.claims || []).forEach(k => claimed.add(k));
  const groups = CATEGORIES.map(cat => ({
    label: cat.label,
    manifests: cat.kinds.map(k => byKind.get(k)).filter(Boolean).map(m => { claimed.add(m.kind); return m; }),
    entries: (cat.entries || []).filter(e => byKind.has(e.kind)),
  }));
  const rest = [...byKind.values()].filter(m => !claimed.has(m.kind)).sort((a, b) => a.label.localeCompare(b.label));
  if (rest.length) groups.push({ label: 'More', manifests: rest });
  return groups.map(g => ({
    label: g.label,
    items: [
      ...g.manifests.map(builtInItem),
      ...(g.entries || []).map(e => ({
        id: e.id, label: e.label, hint: e.hint, icon: 'Search', brand: e.brand, cover: 'searchEngine',
        action: { type: 'spawn', kind: e.kind, props: e.props },
      })),
    ],
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
      items: [{ id: 'make:new', label: q ? `Make a new module: ${q}` : 'Describe the module you want, then press Enter', icon: 'Plus', cover: 'makeModule', action: q ? { type: 'make', request: q } : { type: 'noop' }, keepOpen: !q }],
    }];
  }

  const builtIns = builtInItems(manifests);
  const savedItems = saved.map(s => ({
    id: `saved:${s.id}`, label: s.name || s.manifest?.name || 'Module', hint: s.manifest?.description || 'My module',
    icon: s.manifest?.icon || 'Toolbox', cover: 'module', action: { type: 'saved', id: s.id },
  }));
  const templateItems = templates.map(t => ({
    id: `template:${t.id}`, label: t.manifest?.name || t.id, hint: t.manifest?.description || '',
    icon: t.manifest?.icon || 'Toolbox', cover: 'module', action: { type: 'template', id: t.id },
  }));
  const everything = [...savedItems, ...builtIns.flatMap(g => g.items), ...BOARD_ITEMS, ...templateItems];
  const byId = new Map(everything.map(i => [i.id, i]));
  const own = i => matches(q, i.label, i.hint, i.id);
  const filter = items => items.filter(own).map(i => shownAs(i, q));
  // Rows found only by another name come after the rows found by their own.
  const byOtherName = [...builtIns.flatMap(g => g.items), ...BOARD_ITEMS]
    .filter(i => q && !own(i) && (i.names || []).some(n => startsWords(q, n))).map(i => shownAs(i, q));

  const make = q
    ? { id: 'make:query', label: `Make a new module: ${q}`, hint: 'Built in a sandbox', icon: 'Plus', cover: 'makeModule', action: { type: 'make', request: q } }
    : { id: 'make:describe', label: 'Make a new module…', hint: 'Describe it in plain words', icon: 'Plus', cover: 'makeModule', action: { type: 'describe' }, keepOpen: true };

  const sections = [];
  if (!q) {
    const recentItems = recent.map(id => byId.get(id)).filter(Boolean).slice(0, 4);
    if (recentItems.length) sections.push({ id: 'recent', label: 'Recent', items: recentItems });
  }
  sections.push({ id: 'mine', label: 'My modules', items: filter(savedItems) });
  for (const group of builtIns) sections.push({ id: `cat:${group.label}`, label: group.label, items: filter(group.items) });
  sections.push({ id: 'also', label: 'Also known as', items: byOtherName });
  sections.push({ id: 'boards', label: 'Ready-made boards', items: filter(BOARD_ITEMS) });
  sections.push({ id: 'templates', label: 'Templates', items: filter(templateItems) });

  // A row named exactly what was typed comes first, so "Document" + Enter
  // opens the Document, not the first row that merely mentions documents.
  // A module's own name goes before another module's other name.
  const named = q ? sections.flatMap(sec => sec.items).filter(i => i.label.toLowerCase() === q.toLowerCase()) : [];
  const exact = [...named.filter(i => !i.ownLabel), ...named.filter(i => i.ownLabel)];
  if (exact.length) {
    const ids = new Set(exact.map(i => i.id));
    for (const sec of sections) sec.items = sec.items.filter(i => !ids.has(i.id));
    sections.unshift({ id: 'best', label: 'Best match', items: exact });
  }

  const anyMatch = sections.some(s => s.items.length > 0);
  if (q && !anyMatch) return [{ id: 'make', label: 'No module does that yet', items: [make] }];
  sections.push({ id: 'make', label: '', items: [make] });
  return sections;
}
