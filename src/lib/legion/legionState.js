// Legion window: talking to /api/legion and folding a run's events into what
// the window draws. The folding is pure, so it can be tested.

export const LEGION_ROLES = Object.freeze([
  { id: 'architect', name: 'Architect', job: 'Plans and orchestrates' },
  { id: 'research', name: 'Research', job: 'Finds what to know' },
  { id: 'foresight', name: 'Foresight', job: 'Sees what could go wrong' },
  { id: 'echo', name: 'Echo', job: 'Reviews and judges OK or NOK' },
  { id: 'foundation', name: 'Foundation', job: '1. Setup: Docker, deps' },
  { id: 'nexus', name: 'Nexus', job: '2. Database and schema' },
  { id: 'atlas', name: 'Atlas', job: '3. Backend' },
  { id: 'genesis', name: 'Genesis', job: '4. Frontend' },
]);

export const LEGION_PHASES = Object.freeze([
  { id: 'plan', label: 'Spec' }, { id: 'build', label: 'Work Queue' }, { id: 'combine', label: 'Synthesis' }, { id: 'check', label: 'Validation' },
  { id: 'fix', label: 'Fix' }, { id: 'commit', label: 'Commit' }, { id: 'reflect', label: 'Reflect' },
]);

export const GAMEPLAN_LABELS = Object.freeze({
  skills: 'Skills needed', movingParts: 'Moving parts', coordination: 'Coordination', resources: 'Resources',
  workspace: 'Workspace', convergence: 'Convergence plan', checkups: 'Check-ups', dependencies: 'Who depends on whom',
});

export const roleName = (id) => LEGION_ROLES.find((r) => r.id === id)?.name || (id === 'person' ? 'You' : id);

export function emptyLegion() {
  return {
    phase: null, round: 0, roles: {}, feed: [], shots: [], plan: null, questions: [], spec: null, queue: [], checks: null,
    commit: null, reflection: null, end: null, verdict: null,
  };
}

/** Fold a batch of events into the window's state. */
export function applyLegionEvents(state, events = []) {
  const next = { ...state, roles: { ...state.roles }, feed: state.feed.slice(), shots: state.shots.slice() };
  for (const event of events) {
    switch (event?.type) {
      case 'phase': next.phase = event.phase; next.round = event.round ?? next.round; break;
      case 'role': next.roles[event.role] = { ...next.roles[event.role], status: event.status, model: event.model || next.roles[event.role]?.model, note: event.note || '' }; break;
      case 'say': next.feed.push({ kind: 'say', role: event.role, text: event.text, at: event.at }); break;
      case 'files': next.feed.push({ kind: 'files', role: event.role, job: event.job || '', files: event.files || [], notes: event.notes || '', label: event.label, at: event.at }); break;
      case 'spec': next.spec = { yaml: event.yaml || '', from: event.from }; break;
      case 'queue': next.queue = event.jobs || []; break;
      case 'checks': next.checks = { round: event.round, results: event.results || [] }; break;
      case 'plan': next.plan = { summary: event.summary, gameplan: event.gameplan || {}, specs: event.specs || {} }; break;
      case 'questions': next.questions = event.questions || []; break;
      case 'answered': next.questions = []; next.feed.push({ kind: 'note', text: event.by === 'person' ? 'You answered the questions.' : 'Research answered the questions for the team.', at: event.at }); break;
      case 'search': next.feed.push({ kind: 'note', text: event.note, at: event.at }); break;
      case 'note': next.feed.push({ kind: 'note', text: event.text, at: event.at }); break;
      case 'educate': next.feed.push({ ...event, kind: 'educate', type: undefined }); break;
      case 'remembered': next.feed.push({ kind: 'note', text: `Stored to memory (${event.job}): ${(event.notes || []).join(' ')}`, at: event.at }); break;
      case 'shot': next.shots.push(event); break;
      case 'verdict':
        next.verdict = event;
        next.feed.push({ kind: 'verdict', role: 'echo', verdict: event.verdict, summary: event.summary, todo: event.todo || [], round: event.round, at: event.at });
        break;
      case 'fixes': next.feed.push({ kind: 'fixes', role: 'architect', fixes: event.fixes || {}, round: event.round, at: event.at }); break;
      case 'commit': next.commit = event; break;
      case 'reflection': next.reflection = { agents: event.agents || [], learned: event.learned || '' }; break;
      case 'end': next.end = { status: event.status, error: event.error || null }; next.questions = []; break;
      default: break;
    }
  }
  return next;
}

async function call(url, { method = 'GET', body } = {}) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `The Legion could not do that (${res.status}).`);
  return data;
}

export const legionApi = {
  start: (body) => call('/api/legion/runs', { method: 'POST', body }),
  list: () => call('/api/legion/runs'),
  read: (id, after = 0) => call(`/api/legion/runs/${encodeURIComponent(id)}?after=${after}`),
  answer: (id, text) => call(`/api/legion/runs/${encodeURIComponent(id)}/answer`, { method: 'POST', body: { text } }),
  stop: (id) => call(`/api/legion/runs/${encodeURIComponent(id)}/stop`, { method: 'POST', body: {} }),
  shotUrl: (id, name) => `/api/legion/runs/${encodeURIComponent(id)}/shots/${encodeURIComponent(name)}`,
  viewUrl: (id, token, rel) => `/api/legion-view/${encodeURIComponent(id)}/${encodeURIComponent(token)}/${rel.split('/').map(encodeURIComponent).join('/')}`,
};
