// Censai the orchestrator (server/censaiOrchestrator): Censai turns an ask into a short
// plan and hands each part to the family member who fits. The work runs in
// the background; each job's checklist is checked off item by item before
// the person hears about it.
import { FILE_CHANGERS, MAX_ITEMS, MAX_JOBS, HANDOFF_AGENTS, TESTS_ITEM, nameList } from '../../censaiOrchestrator/shape.js';

const READERS = HANDOFF_AGENTS.filter((id) => !FILE_CHANGERS.includes(id));

export const PLAN_TOOL_NAMES = Object.freeze(['hand_off_jobs', 'jobs_status', 'stop_jobs']);

export const censaiPlanTools = [
  {
    type: 'function',
    function: {
      name: 'hand_off_jobs',
      description: [
        'Hand the jobs of a plan to the family so the work runs in the background while you keep chatting.',
        'Use it when the person asks for real work: fixing a bug, building or changing something, looking into something, writing something.',
        `Think the plan through first, then give 1 to ${MAX_JOBS} jobs in order, each for the family member who fits best.`,
        `Code and file changes go to ${nameList(FILE_CHANGERS)}; ${nameList(READERS, 'and')} can look things up, read files and write answers.`,
        'Give each job a checklist: the things that must be true before it counts as done. You check off each item yourself before the person hears about it:',
        '"tests" runs the project\'s own tests, "file" looks for a file that must exist, "answer" reads the reply against the item.',
        `Code and file jobs always get "${TESTS_ITEM}". A job is done only when every item is checked off.`,
        'An item that is not true yet goes back to the family member once; if it still is not, or it cannot be checked here, the plan stops there and says which item.',
        'The person sees every step and every item in this chat, then one line when it is done, or stuck. It has only started when this returns: never say it is done.',
      ].join(' '),
      parameters: {
        type: 'object',
        properties: {
          goal: { type: 'string', description: 'What the person wants, in one plain sentence.' },
          project: { type: 'string', description: 'The project the work is in, as project_list names it. Code work and test runs need it, so the tests run where the work is.' },
          jobs: {
            type: 'array',
            description: `The jobs in order (1 to ${MAX_JOBS}). Each later job sees the checked answers of the ones before it.`,
            items: {
              type: 'object',
              properties: {
                agent: { type: 'string', enum: [...HANDOFF_AGENTS], description: 'Who does it.' },
                job: { type: 'string', description: 'What to do, specific enough to do without asking: files, names, what to look for.' },
                checklist: {
                  type: 'array',
                  description: `What must be true before this job counts as done, 1 to ${MAX_ITEMS} items, each one thing you can check.`,
                  items: {
                    type: 'object',
                    properties: {
                      item: { type: 'string', description: 'One thing that must be true, in plain words, such as "the header shows today\'s date".' },
                      check: { type: 'string', enum: ['answer', 'file', 'tests'], description: 'How you check it: answer (read the reply), file (the file must exist; give path) or tests (run the project\'s tests).' },
                      path: { type: 'string', description: 'For a file check: the file\'s path inside the project, such as src/Header.jsx.' },
                    },
                    required: ['item'],
                  },
                },
                kind: { type: 'string', enum: ['code', 'answer'], description: 'code when files or code change, answer when the job is to find out or write something.' },
              },
              required: ['agent', 'job', 'checklist'],
            },
          },
        },
        required: ['goal', 'jobs'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'jobs_status',
      description: 'See the plans you handed out for this person: what each family member is doing, which checklist items are checked off, and what they answered. Use it when the person asks how the work is going or what came back.',
      parameters: {
        type: 'object',
        properties: {
          plan_id: { type: 'string', description: 'One plan, by its id. Leave it out for the ones still open.' },
          include_finished: { type: 'boolean', description: 'Also list the last few finished plans.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'stop_jobs',
      description: 'Stop a plan that is still running, when the person asks you to. The job in progress stops and the rest do not start.',
      parameters: {
        type: 'object',
        properties: {
          plan_id: { type: 'string', description: 'The plan to stop. Leave it out to stop the newest running plan.' },
        },
      },
    },
  },
];
