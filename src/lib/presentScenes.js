import { MIN_ZOOM, MAX_ZOOM } from './canvasMath.js';
import { GROUP_HOTKEY_SLOTS, computeGroupFocusView } from './groupHotkeys.js';

// Present mode: an ordered run of scenes over the board, one per F-key.
//
// A scene shows either the group bound to its F-key (Alt/Ctrl+<n>) or a board
// area the presenter picked ("Use what's on screen now"). Scenes that show
// nothing yet are skipped, so the run is always only what can be shown.
// Scene lists persist per workspace in localStorage, like the F-key bindings.
// Pure functions live here; the key listener and the stage are in
// src/app/present/.

const STORAGE_KEY = 'homebase.present-scenes.v1';

// The Tavily podcast demo path (docs/specs/README.md). Names stay empty so the
// progress line shows the group's own label; the talking points ride along as
// presenter notes.
const PODCAST_NOTES = [
  'Change the whole look of the board in one click, from a dark cockpit to a light studio. Anyone can make it theirs.',
  'LeadHound: type a business and its target market. Tavily finds the leads, the model ranks them and writes a 7-day intro sequence and an ice breaker.',
  'A second laptop joins. Both of you type in one document and move windows at the same time.',
  'Ask one agent for something and watch it hand off to a specialist agent.',
  'Paste a design onto the canvas and keep building it with a model, borderless.',
  'Show the Watch link and the viewer count, and invite listeners to come look at the board.',
];

export const PODCAST_PLACEHOLDERS = Object.freeze([
  'Change the look', 'LeadHound finds leads', 'Two people, one board',
  'Agents hand off', 'Design to code', 'Come try it',
]);

export function defaultScenes() {
  return PODCAST_NOTES.map((notes, i) => ({ id: `scene-${i + 1}`, key: String(i + 1), name: '', notes, area: null }));
}

function readStore() {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function cleanArea(area) {
  if (!area || typeof area !== 'object') return null;
  const nums = ['x', 'y', 'w', 'h'].map((k) => Number(area[k]));
  if (!nums.every(Number.isFinite) || nums[2] <= 0 || nums[3] <= 0) return null;
  return { x: nums[0], y: nums[1], w: nums[2], h: nums[3] };
}

/** Normalize a scene list: valid keys, one scene per key, strings only. */
export function cleanScenes(list) {
  if (!Array.isArray(list)) return null;
  const used = new Set();
  const out = [];
  for (const raw of list) {
    const key = String(raw?.key ?? '');
    if (!GROUP_HOTKEY_SLOTS.includes(key) || used.has(key)) continue;
    used.add(key);
    out.push({
      id: typeof raw.id === 'string' && raw.id ? raw.id : `scene-${key}-${out.length}`,
      key,
      name: typeof raw.name === 'string' ? raw.name.slice(0, 80) : '',
      notes: typeof raw.notes === 'string' ? raw.notes.slice(0, 4000) : '',
      area: cleanArea(raw.area),
    });
  }
  return out;
}

/** Scenes for a workspace; the podcast set when none were saved yet. */
export function loadScenes(workspaceId) {
  const saved = workspaceId ? cleanScenes(readStore()?.[workspaceId]) : null;
  return saved || defaultScenes();
}

export function saveScenes(workspaceId, scenes) {
  if (!workspaceId) return;
  try {
    const all = readStore();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...all, [workspaceId]: cleanScenes(scenes) || [] }));
  } catch {
    // Storage full / private mode: scenes just won't persist.
  }
}

/**
 * The scenes that can be shown right now, in order, each with what it shows:
 * { scene, group } for a bound group, { scene, area } for a picked area.
 * A picked area wins over the F-key group.
 */
export function resolveRun(scenes = [], bindings = {}, canvasGroups = []) {
  const run = [];
  for (const scene of scenes) {
    if (scene.area) { run.push({ scene, area: scene.area, group: null }); continue; }
    const groupId = bindings?.[scene.key];
    const group = groupId ? canvasGroups.find((g) => g.id === groupId) : null;
    if (group) run.push({ scene, group, area: null });
  }
  return run;
}

/** What the progress line calls a scene: its own name, else the group's. */
export function sceneLabel(entry) {
  if (!entry) return '';
  return entry.scene.name || entry.group?.label || (entry.group ? 'Group' : 'Board area');
}

const AREA_PADDING = 24;

/** Pan/zoom that makes a board area fill the viewport. */
export function computeAreaView(area, viewport = {}) {
  const W = viewport.w ?? (typeof window !== 'undefined' ? window.innerWidth : 1280);
  const H = viewport.h ?? (typeof window !== 'undefined' ? window.innerHeight : 800);
  const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM,
    (W - AREA_PADDING * 2) / Math.max(1, area.w), (H - AREA_PADDING * 2) / Math.max(1, area.h)));
  return {
    pan: { x: W / 2 - (area.x + area.w / 2) * zoom, y: H / 2 - (area.y + area.h / 2) * zoom },
    zoom,
  };
}

/** The board area currently on screen, in board coordinates. */
export function areaOnScreen(pan, zoom, viewport = {}) {
  const W = viewport.w ?? (typeof window !== 'undefined' ? window.innerWidth : 1280);
  const H = viewport.h ?? (typeof window !== 'undefined' ? window.innerHeight : 800);
  const z = zoom || 1;
  return { x: -pan.x / z, y: -pan.y / z, w: W / z, h: H / z };
}

/** Viewport for one run entry (group fill or area fill). */
export function viewForEntry(entry, viewport) {
  return entry.group ? computeGroupFocusView(entry.group, viewport) : computeAreaView(entry.area, viewport);
}
