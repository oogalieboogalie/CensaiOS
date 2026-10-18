// Legion: the team and what each one is told. Alex's diagram ("Not swarms..
// Legions.") names them: the Architect plans and orchestrates, Research,
// Foresight and Echo advise on the plan, Echo judges every build, and four
// builders work in a fixed order (Foundation, Nexus, Atlas, Genesis).
//
// Every role gets the same CONTEXT block, so each one knows the goal, its own
// role and the build order, and sets itself up for the ones after it.

export const BUILD_ORDER = Object.freeze(['foundation', 'nexus', 'atlas', 'genesis']);
export const ADVISORS = Object.freeze(['research', 'foresight', 'echo']);
export const ROLE_IDS = Object.freeze(['architect', ...ADVISORS, ...BUILD_ORDER]);

export const ROLES = Object.freeze({
  architect: { name: 'Architect', job: 'plans the project, hands each builder its own spec, and writes fixing instructions when Echo says NOK' },
  research: { name: 'Research', job: 'says what is worth knowing before building: the simplest proven way to do it and what to avoid' },
  foresight: { name: 'Foresight', job: 'looks ahead: what could go wrong later, what the builders must leave room for' },
  echo: { name: 'Echo', job: 'reviews the plan, then judges every build OK or NOK after looking at the files and the screenshot' },
  foundation: { name: 'Foundation', job: 'builder 1: project setup (package.json, Dockerfile, README with how to run it, dependencies)' },
  nexus: { name: 'Nexus', job: 'builder 2: database and schema (SQL files, seed data, data shapes Atlas will wire into)' },
  atlas: { name: 'Atlas', job: 'builder 3: backend (server, API routes) wired to the tables Nexus made. Works at the same time as Genesis' },
  genesis: { name: 'Genesis', job: 'builder 4: frontend, at the same time as Atlas (Synthesis joins the two afterwards). Must leave a working index.html at the project root, using only the project\'s own files (the check browser has no internet)' },
});

const CHAT_LINES = 24;
const CHAT_CHARS = 6000;

/** The team chat as text: everyone sees what everyone else said. */
export function chatBlock(chat = []) {
  const name = (role) => ROLES[role]?.name || (role === 'person' ? 'The person who asked' : role);
  const lines = chat.slice(-CHAT_LINES).map((m) => `${name(m.role)}: ${m.text}`);
  let text = lines.join('\n');
  if (text.length > CHAT_CHARS) text = `...${text.slice(-CHAT_CHARS)}`;
  return text ? `Team chat so far (everyone sees this):\n${text}` : '';
}

export function contextBlock({ goal, role, plan = null, chat = [] }) {
  const order = BUILD_ORDER.map((id, i) => `${i + 1}. ${ROLES[id].name}: ${ROLES[id].job}`).join('\n');
  return [
    'CONTEXT (everyone on the Legion sees this)',
    `Goal: ${goal}`,
    `You are ${ROLES[role].name}: you ${ROLES[role].job}.`,
    `Build order:\n${order}`,
    plan?.summary ? `The Architect's plan: ${plan.summary}` : '',
    plan?.answers ? `Answers to the team's questions: ${plan.answers}` : '',
    chatBlock(chat),
  ].filter(Boolean).join('\n\n');
}

export const GAMEPLAN_KEYS = Object.freeze([
  ['skills', 'Skills needed'], ['movingParts', 'Moving parts'], ['coordination', 'Coordination'], ['resources', 'Resources'],
  ['workspace', 'Workspace'], ['convergence', 'Convergence plan'], ['checkups', 'Check-ups'], ['dependencies', 'Who depends on whom'],
]);

const FILE_FORMAT = [
  'Reply with every file you create or change in this exact format, nothing else around it:',
  '=== FILE: relative/path/to/file.ext',
  '(the whole file content)',
  '=== END',
  'Then one line: NOTES: (one sentence for the next builder).',
  'Optionally one last line: REMEMBER: (one sentence of major or important info worth keeping for future projects).',
  'Paths are relative to the project root. Write whole files, never diffs. Keep it small and working.',
  'Load nothing from the internet (no CDN links): the browser that checks the page cannot reach it.',
].join('\n');

export const PROMPTS = Object.freeze({
  draft: [
    'Write a first plan for the goal. If something important is unclear, ask at most three clarifying questions; ask none when the goal is clear enough.',
    'Reply in JSON only: {"summary": "two or three plain sentences", "questions": ["..."]}',
  ].join('\n'),
  answerFor: 'Nobody answered the team\'s clarifying questions, so answer them yourself. Use the web search results when they help; otherwise pick the sensible default and say it is an assumption. Reply in JSON only: {"answers": ["one per question"]}',
  advise: (role) => `Read the Architect's first plan and what the others said in the team chat, then give your advice as ${ROLES[role].name}. Reply in JSON only: {"notes": ["short point", "..."]} with at most four points.`,
  final: [
    'You are the Orchestrator Engine. Turn your plan and the team chat into a gameplan, a Work Queue of jobs, and the checks the Validation Engine will run.',
    'Jobs: each has an id (J-001, J-002...), an owner (foundation, nexus, atlas or genesis) and a task small enough for one agent. Split big work into several jobs for the same builder so they can run side by side. Builders with nothing to do get no jobs. depends_on is optional (by default a job waits for the builders before it, except that Atlas and Genesis run side by side and Synthesis joins front and back afterwards).',
    'Checks: each has an id (C-001...), the job it checks, and one rule: file_exists (a path), file_contains ({"file": "...", "text": "..."}), page_contains (text the page must show) or no_script_errors (true). Add a page_contains check for every number or word the person must see.',
    'Genesis must always make a root index.html that uses only the project\'s own files.',
    'Gameplan fields, one or two plain sentences each: skills (skills needed), movingParts, coordination (who hands what to whom), resources, workspace, convergence (how the parts come together), checkups (when Echo checks), dependencies (which agent waits on which).',
    'Reply in JSON only: {"summary": "...", "gameplan": {"skills": "...", "movingParts": "...", "coordination": "...", "resources": "...", "workspace": "...", "convergence": "...", "checkups": "...", "dependencies": "..."}, "jobs": [{"id": "J-001", "owner": "genesis", "task": "...", "depends_on": []}], "checks": [{"id": "C-001", "job": "J-001", "page_contains": "Total"}]}',
  ].join('\n'),
  build: FILE_FORMAT,
  judge: [
    'Judge the build against the goal and each builder\'s spec. Look at the screenshot of the running page when there is one.',
    'Say OK only when it works and does what the goal asks. Otherwise NOK, with one to-do per problem, naming the job UID and builder who own it and the exact file and line when you can.',
    'Reply in JSON only: {"verdict": "OK" or "NOK", "summary": "one sentence", "todo": [{"job": "J-001", "owner": "foundation|nexus|atlas|genesis", "problem": "...", "file": "...", "line": 0}]}',
  ].join('\n'),
  fix: [
    'The Validation Engine sent jobs back. Write fixing instructions for each failed job, by its UID.',
    'Reply in JSON only: {"fixes": {"J-001": "what to change and where", "...": "..."}}',
  ].join('\n'),
  reflect: [
    'Global post-project reflection. For each agent on the Legion give 2 positives and 1 negative from this run, then a summary of what was learned for next time.',
    'Reply in JSON only: {"agents": [{"role": "architect", "positives": ["...", "..."], "negative": "..."}], "learned": "two or three sentences"}',
  ].join('\n'),
});
