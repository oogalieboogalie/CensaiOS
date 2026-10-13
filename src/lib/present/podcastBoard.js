import { useWorkspaceStore } from '../store.js';
import { loadGroupHotkeys, saveGroupHotkeys } from '../groupHotkeys.js';
import { defaultScenes, PODCAST_PLACEHOLDERS } from '../presentScenes.js';
import { SAMPLE_HUNT } from '../wakeUp/sampleHunt.js';
import { LOOK_NOTES, PODCAST_DESIGN_HTML } from './podcastDesign.js';

// "Build the podcast board": lays out the six podcast scenes (docs/specs/
// README.md) as groups to the right of whatever is already on the board,
// binds them to F1..F5, points F6 at the whole row, and names every scene.
// One click instead of building and binding six groups by hand. Nothing on
// the board is moved or deleted; running it again builds a fresh row.

export const PODCAST_BOARD_EVENT = 'censai:group-hotkeys-changed';
const SLOT = { w: 1240, h: 760, gap: 160 };

// The brief Alex runs live: censaiOS itself, sold to small agencies.
export const PODCAST_BRIEF = Object.freeze({
  business: 'censaiOS: one shared canvas where a small team, its clients and its AI agents work together',
  market: 'Small digital marketing agencies with 5 to 30 people',
  region: '',
  maxLeads: 3,
});

const SHOW_NOTES = [
  '# Show notes',
  '',
  'Type here while your guest types too. Both cursors show, and every letter lands for both of you.',
].join('\n');

/** The five group scenes, each as [kind, props, dx, dy, w, h] windows. */
export function podcastSceneSpecs() {
  return [
    { label: PODCAST_PLACEHOLDERS[0], windows: [
      ['appearance', { title: 'Appearance' }, 0, 0, 560, 720],
      ['doc', { title: 'Make it yours', fileName: 'make-it-yours.md', text: LOOK_NOTES }, 600, 0, 640, 720],
    ] },
    { label: PODCAST_PLACEHOLDERS[1], windows: [
      ['leadHound', { title: 'LeadHound', leadHound: { brief: { ...PODCAST_BRIEF }, result: null } }, 0, 0, 840, 720],
      ['research', { title: 'Research' }, 880, 0, 360, 720],
    ] },
    { label: PODCAST_PLACEHOLDERS[2], windows: [
      ['doc', { title: 'Show notes', fileName: 'show-notes.md', text: SHOW_NOTES }, 0, 0, 760, 720],
      ['chat', { agentId: 'censai', title: 'Censai' }, 800, 0, 440, 720],
    ] },
    { label: PODCAST_PLACEHOLDERS[3], windows: [
      ['chat', { agentId: 'atlas', title: 'Atlas' }, 0, 0, 360, 720],
      ['leadHound', { title: 'LeadHound · for agents', leadHound: { brief: SAMPLE_HUNT.brief, result: SAMPLE_HUNT, sample: true } }, 380, 0, 500, 720],
      ['registry', { title: 'Agent Registry' }, 900, 0, 340, 720],
    ] },
    { label: PODCAST_PLACEHOLDERS[4], windows: [
      ['designBlock', { title: 'Landing page', sourceType: 'html', frameless: true, bare: true, source: PODCAST_DESIGN_HTML }, 0, 0, 820, 720],
      ['chat', { agentId: 'censai', title: 'Censai' }, 860, 0, 380, 720],
    ] },
  ];
}

/** Where the new row starts: clear of every window already on the board. */
export function rowOrigin(wins = []) {
  const right = wins.reduce((max, w) => Math.max(max, (Number(w.x) || 0) + (Number(w.w) || 0)), -Infinity);
  const top = wins.reduce((min, w) => Math.min(min, Number(w.y) || 0), Infinity);
  return Number.isFinite(right) ? { x: Math.round(right + 400), y: Math.round(top) } : { x: 0, y: 0 };
}

/** Builds the row, binds the keys and names the scenes. Returns the group ids. */
export function buildPodcastBoard({ workspaceId, setScenes, store = useWorkspaceStore, emit = true } = {}) {
  const origin = rowOrigin(store.getState().wins);
  const specs = podcastSceneSpecs();
  const ids = specs.map((spec, i) => {
    const x0 = origin.x + i * (SLOT.w + SLOT.gap);
    for (const [kind, props, dx, dy, w, h] of spec.windows) {
      store.getState().spawnAt(kind, props, { x: x0 + dx, y: origin.y + dy }, { w, h });
    }
    const id = store.getState().spawnGroup({ x: x0 - 20, y: origin.y - 20 }, { w: SLOT.w + 40, h: SLOT.h + 20 });
    store.setState((st) => ({ canvasGroups: st.canvasGroups.map((g) => (g.id === id ? { ...g, label: spec.label } : g)) }));
    return id;
  });

  const bindings = { ...loadGroupHotkeys(workspaceId) };
  ids.forEach((id, i) => { bindings[String(i + 1)] = id; });
  saveGroupHotkeys(workspaceId, bindings);

  const area = { x: origin.x - 80, y: origin.y - 120, w: specs.length * (SLOT.w + SLOT.gap) + 160, h: SLOT.h + 240 };
  setScenes?.(defaultScenes().map((scene, i) => ({
    ...scene,
    name: PODCAST_PLACEHOLDERS[i],
    area: scene.key === '6' ? area : null,
  })));
  if (emit && typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(PODCAST_BOARD_EVENT));
  return ids;
}
