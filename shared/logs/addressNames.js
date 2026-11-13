// Names people chose end up in the app's web addresses: Run dev and Docker
// name things after a project's folder (a Run dev container is
// censai-dev-<folder>-<hash>, server/devServers/manager.js, and a compose
// project is by default its folder's name, as are its containers, volumes,
// networks and the images it builds), a canvas group's goals and
// milestones are asked for by the group's name
// (src/components/group/useGroupData.js), and a project's id is made from its
// name (shared-<name>, sharedProjectIdFor in server/workspaces/projects.js;
// an older install made it from its name too). Log lines and logged addresses
// never carry those names; a Run dev container keeps its folder's hash, so
// its lines can still be followed. No Node imports: the board's
// failed-request line (src/lib/appLog/browserLog.js) uses this as well as the
// server's log.

// The hash is the last part of a Run dev container's name (projectKey in manager.js).
const RUN_DEV_NAME = /^censai-dev-.+-([0-9a-f]{10})$/;

/** The folder's hash at the end of a Run dev container's name, or null for any other name. */
export function runDevHash(name) {
  return RUN_DEV_NAME.exec(String(name ?? ''))?.[1] || null;
}

/** A Run dev container's name with its folder's part hidden; any other name hidden whole. */
export function runDevNameForLog(name) {
  const hash = runDevHash(name);
  return hash ? `censai-dev-[redacted]-${hash}` : '[redacted]';
}

const NAMED_PATH_PARTS = [
  // Run dev's own word (heartbeat) stays; a container's name keeps only its hash.
  [/^(\/api\/dev-servers\/)(?!heartbeat(?:[/?#]|$))([^/?#]+)/i, (_, head, name) => `${head}${runDevNameForLog(name)}`],
  [/^(\/api\/docker\/(?:compose|volumes|networks)\/)[^/?#]+/i, '$1[redacted]'],
  // The Docker window asks for a container by Docker's id, and Run dev's log
  // view by the container's name: a name keeps only Run dev's hash.
  [/^(\/api\/docker\/containers\/)(?![0-9a-f]{12,64}(?:[/?#]|$))([^/?#]+)/i, (_, head, name) => `${head}${runDevNameForLog(name)}`],
  // A group's goals and milestones are read by the group's name, and one is
  // changed by its id (a UUID, docker/004-sub-agents.sql), which stays.
  [/^(\/api\/(?:goals|milestones)\/)(?![0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?:[/?#]|$))[^/?#]+/i, '$1[redacted]'],
  // A board saves which of its agents work in a project by the project's id.
  [/^(\/api\/workspaces\/[^/?#]+\/agent-projects\/)[^/?#]+/i, '$1[redacted]'],
  // A data box keeps its notes by project: the board's own word (default) stays.
  [/^(\/api\/scratchpad\/[^/?#]+\/)(?!default(?:[/?#]|$))[^/?#]+/i, '$1[redacted]'],
];

const PROJECT_ID = /^shared-./i;

/** True when a part of an address, or a setting's value, is a project's id (made from its name). */
export function isProjectId(text) {
  return PROJECT_ID.test(String(text ?? ''));
}

/** An address with the names people gave a project, its folder or a canvas group hidden. */
export function hideNamesInAddress(address) {
  let text = String(address ?? '');
  for (const [pattern, to] of NAMED_PATH_PARTS) text = text.replace(pattern, to);
  if (!/^\/api\//i.test(text)) return text;
  // A project's id anywhere else in the app's own addresses, should a new one take it.
  const at = text.search(/[?#]|$/);
  return text.slice(0, at).split('/').map((part) => (isProjectId(part) ? '[redacted]' : part)).join('/') + text.slice(at);
}
