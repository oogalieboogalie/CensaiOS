// WeeWoo company: one WeeWoo window on the board is one company. Its
// departments and who sits where are fields on that window, one field per
// department (`wd.<id>`) and per seat (`ws.<windowId>`), so two people
// editing different departments at once both keep their change through
// the board's Yjs doc. Removed departments are set to null. Pure.

export const WEEWOO_KIND = 'weewoo';
export const LOBBY_ID = 'lobby';
const DEPT_PREFIX = 'wd.';
const SEAT_PREFIX = 'ws.';

// Department colors use the design system's status palette.
export const DEPT_COLORS = Object.freeze([
  'var(--ps-blue)', 'var(--ps-green)', 'var(--ps-purple)', 'var(--ps-amber)', 'var(--ps-pink)', 'var(--ps-orange)', 'var(--ps-red)', 'var(--ps-yellow)',
]);

// The starter departments, from the WeeWoo design. Their ids double as the
// role buckets agents are sorted into before anyone seats them.
export const STARTER_DEPARTMENTS = Object.freeze([
  { id: 'ops', name: 'Operations', blurb: 'Inboxes, schedules, the daily churn.', color: 'var(--ps-blue)' },
  { id: 'engineering', name: 'Engineering', blurb: 'Bug hunters and code monkeys.', color: 'var(--ps-green)' },
  { id: 'research', name: 'Research', blurb: "Reads everything so you don't have to.", color: 'var(--ps-purple)' },
  { id: 'growth', name: 'Growth', blurb: 'Outbound, drip, and the lead funnel.', color: 'var(--ps-amber)' },
  { id: 'people', name: 'People', blurb: 'Onboarding, HR, vibes.', color: 'var(--ps-pink)' },
]);

export const LOBBY = Object.freeze({ id: LOBBY_ID, name: 'Lobby', blurb: 'New hires arrive here.', color: 'var(--ink-faint)', lobby: true });

/** Window props for a new company. */
export function companyStarter(name = 'My company') {
  const props = { title: name };
  STARTER_DEPARTMENTS.forEach((dept, i) => {
    props[`${DEPT_PREFIX}${dept.id}`] = { name: dept.name, blurb: dept.blurb, color: dept.color, at: i + 1 };
  });
  return props;
}

export const deptKey = (id) => `${DEPT_PREFIX}${id}`;
export const seatKey = (windowId) => `${SEAT_PREFIX}${windowId}`;

/** The company's departments in order, the Lobby last. */
export function listDepartments(win = {}) {
  const out = [];
  for (const [key, value] of Object.entries(win || {})) {
    if (!key.startsWith(DEPT_PREFIX) || !value || typeof value !== 'object') continue;
    out.push({ id: key.slice(DEPT_PREFIX.length), name: String(value.name || 'Department'), blurb: String(value.blurb || ''), color: value.color || 'var(--ink-faint)', at: Number(value.at) || 0 });
  }
  out.sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
  return [...out, { ...LOBBY }];
}

/** Where people seated each agent window: { windowId: deptId }. */
export function listSeats(win = {}) {
  const seats = {};
  for (const [key, value] of Object.entries(win || {})) {
    if (key.startsWith(SEAT_PREFIX) && typeof value === 'string' && value) seats[key.slice(SEAT_PREFIX.length)] = value;
  }
  return seats;
}

/** Patch that adds a department. */
export function addDepartmentPatch(win, { name, blurb = '', id = null } = {}) {
  const depts = listDepartments(win).filter((d) => !d.lobby);
  const clean = String(name || '').trim().slice(0, 40) || 'New department';
  const newId = id || `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  const at = depts.reduce((max, d) => Math.max(max, d.at), 0) + 1;
  return { [deptKey(newId)]: { name: clean, blurb: String(blurb).slice(0, 120), color: DEPT_COLORS[depts.length % DEPT_COLORS.length], at } };
}

/** Patch that renames or recolors a department. */
export function editDepartmentPatch(win, id, changes = {}) {
  const current = win?.[deptKey(id)];
  if (!current) return {};
  const next = { ...current };
  if (typeof changes.name === 'string') next.name = changes.name.trim().slice(0, 40) || current.name;
  if (typeof changes.blurb === 'string') next.blurb = changes.blurb.slice(0, 120);
  if (typeof changes.color === 'string') next.color = changes.color;
  return { [deptKey(id)]: next };
}

/** Patch that removes a department; its agents go back to the Lobby. */
export function removeDepartmentPatch(win, id) {
  const patch = { [deptKey(id)]: null };
  for (const [windowId, deptId] of Object.entries(listSeats(win))) if (deptId === id) patch[seatKey(windowId)] = LOBBY_ID;
  return patch;
}

/** Patch that seats an agent window in a department (or the Lobby). */
export function seatPatch(windowId, deptId) {
  return { [seatKey(windowId)]: deptId || LOBBY_ID };
}
