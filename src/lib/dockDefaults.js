/**
 * src/lib/dockDefaults.js
 *
 * Brief B3 — extracted from Dock.jsx so DEFAULT_GROUPS can be imported
 * by src/lib/store.js without creating an import cycle:
 *
 *   store.js  ->  Dock.jsx  ->  useDockVisibility.js  ->  store.js
 *
 * Was previously: `import { DEFAULT_GROUPS } from '../components/Dock.jsx';`
 * inside store.js, which worked because Dock.jsx didn't import store.js.
 * B3 added the useDockVisibility hook under src/components/dock/, which
 * imports from store.js, closing the cycle. Extracting DEFAULT_GROUPS to
 * a leaf module breaks the cycle cleanly.
 */

export const DEFAULT_GROUPS = [
  { id: 'core', name: 'Core Team', hue: 5, agentIds: ['architect','censai','atlas','genesis','nexus','foundation','echo','phoenix'], collapsed: false },
];

// Reconcile persisted dock groups against the live agent roster (pure).
// Drops ids that no longer resolve (deleted agents) and seats Phoenix on
// the Core Team if he's known but missing. Everything else is untouched.
export function reconcileDockGroups(groups, knownIds, { seatPhoenix = true } = {}) {
  const known = new Set(knownIds || []);
  return (groups || []).map((group) => {
    const original = group.agentIds || [];
    const ids = original.filter((id) => known.has(id));
    const isCore = group.id === 'core' || group.name === 'Core Team';
    const next = [...ids];
    if (seatPhoenix && isCore && known.has('phoenix') && !next.includes('phoenix')) next.push('phoenix');
    if (next.length === original.length && next.every((id, i) => id === original[i])) return group;
    return { ...group, agentIds: next };
  });
}