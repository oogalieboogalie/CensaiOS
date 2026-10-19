// Legion: the planning step, from both of Alex's diagrams.
//
//   1. The Architect drafts a plan and may ask up to three clarifying
//      questions.
//   2. Questions go to the person. When they say "let the team decide" (or
//      nobody answers in time), Research searches the web with the person's
//      own Tavily key and answers them, marking guesses as assumptions.
//   3. Research, Foresight and Echo advise one after another in the team
//      chat, so each one sees what the others already said.
//   4. The Architect, as the Orchestrator Engine, writes the gameplan
//      (skills, moving parts, coordination, resources, workspace,
//      convergence, check-ups, dependencies) and the YAML spec: jobs with
//      UIDs for the Work Queue and checks for the Validation Engine.
import { ADVISORS, BUILD_ORDER, GAMEPLAN_KEYS, PROMPTS } from './roles.js';
import { parseJsonReply } from './parse.js';
import { cleanSpec } from './spec.js';

const str = (value, max = 4000) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
const list = (value, max, each = 300) => (Array.isArray(value) ? value : []).map((v) => str(v, each)).filter(Boolean).slice(0, max);

async function teamAnswers({ team, questions, search }) {
  const found = [];
  for (const question of questions) {
    try {
      const hits = await search(question);
      if (hits?.length) found.push(`Q: ${question}\n${hits.slice(0, 4).map((h) => `- ${h.title}: ${h.content}`).join('\n')}`);
    } catch { /* no key or no network: Research answers from what it knows */ }
  }
  team.emit({ type: 'search', count: found.length, note: found.length ? 'Research searched the web.' : 'No web search (no Tavily key); Research answered from what it knows.' });
  const task = [PROMPTS.answerFor, `Questions:\n${questions.map((q, i) => `${i + 1}. ${q}`).join('\n')}`,
    found.length ? `Web search results:\n${found.join('\n\n')}` : ''].filter(Boolean).join('\n\n');
  const answers = list(parseJsonReply(await team.turn('research', task))?.answers, questions.length, 600);
  return questions.map((q, i) => `${q} ${answers[i] || 'Assumption: the simplest sensible choice.'}`).join(' | ');
}

/** Returns { plan: { summary, answers, gameplan, specs }, spec: { goal, jobs, checks } }. */
export async function planProject({ goal, team, lessons = [], askPerson, search }) {
  const learned = lessons.length ? `\n\nWhat earlier Legions learned:\n- ${lessons.join('\n- ')}` : '';
  const draft = parseJsonReply(await team.turn('architect', PROMPTS.draft + learned)) || {};
  const plan = { summary: str(draft.summary, 1200) || goal, answers: '', gameplan: {}, specs: {} };
  team.setPlan(plan);
  team.say('architect', plan.summary);

  const questions = list(draft.questions, 3);
  if (questions.length) {
    team.emit({ type: 'questions', questions });
    team.say('architect', `Questions before we build:\n${questions.map((q, i) => `${i + 1}. ${q}`).join('\n')}`);
    const reply = str(await askPerson(questions), 3000);
    if (reply) {
      plan.answers = reply;
      team.emit({ type: 'answered', by: 'person', text: reply });
    } else {
      plan.answers = await teamAnswers({ team, questions, search });
      team.emit({ type: 'answered', by: 'research', text: plan.answers });
    }
    team.say(reply ? 'person' : 'research', plan.answers);
  }

  for (const role of ADVISORS) {
    const notes = list(parseJsonReply(await team.turn(role, PROMPTS.advise(role)))?.notes, 4);
    team.say(role, notes.length ? notes.join('\n') : 'Nothing to add.');
  }

  const final = parseJsonReply(await team.turn('architect', PROMPTS.final)) || {};
  plan.summary = str(final.summary, 1200) || plan.summary;
  for (const [key] of GAMEPLAN_KEYS) plan.gameplan[key] = str(final.gameplan?.[key], 600);
  let { spec } = cleanSpec({ goal, jobs: final.jobs, checks: final.checks }, goal);
  if (!spec) {
    // The plan came back without usable jobs: one Genesis job keeps the Legion going.
    spec = cleanSpec({ goal, jobs: [{ id: 'J-001', owner: 'genesis', task: `Build: ${goal}. Make a root index.html that uses only the project's own files.` }],
      checks: [{ id: 'C-001', job: 'J-001', file_exists: 'index.html' }, { id: 'C-002', job: 'J-001', no_script_errors: true }] }, goal).spec;
  }
  if (!spec.jobs.some((j) => j.owner === 'genesis')) {
    let n = spec.jobs.length + 1;
    while (spec.jobs.some((j) => j.id === `J-${String(n).padStart(3, '0')}`)) n += 1;
    spec.jobs.push({ id: `J-${String(n).padStart(3, '0')}`, owner: 'genesis', task: 'Make a root index.html that shows the result, using only the project\'s own files.', dependsOn: [] });
  }
  for (const role of BUILD_ORDER) plan.specs[role] = spec.jobs.filter((j) => j.owner === role).map((j) => `${j.id}: ${j.task}`).join('\n');
  team.emit({ type: 'plan', summary: plan.summary, gameplan: plan.gameplan, specs: plan.specs });
  return { plan, spec };
}
