import { jest } from '@jest/globals';

// Agent tools that change the computer and Censai code jobs refuse a
// teammate the same way the owner-only routes do: on the desktop app, to
// someone typing at this computer, the refusal names the owner account and
// theirs. A shared server never names anyone, and the 'owner-only' log line
// says which feature, never a name. Fake people only.
const logLines = [];
jest.unstable_mockModule('../server/logger.js', () => ({
  createLogger: (name) => {
    const write = (level) => (message, meta) => logLines.push({ name, level, message, meta });
    return { info: write('info'), warn: write('warn'), error: write('error'), debug: write('debug'), startTimer: () => () => 0 };
  },
}));

const { assertHostToolAllowed } = await import('../server/tools/rbac/hostOwnerOnly.js');
const { OWNER_ONLY_MESSAGE } = await import('../server/security/systemAdmin.js');
const { handleCensaiPlanTool } = await import('../server/tools/handlers/censaiOrchestrator.js');
const { resetPlansForTests } = await import('../server/censaiOrchestrator/runner.js');
const { fakePlanDb } = await import('./support/censaiPlanDb.js');

const NAMES = { 7: 'Pat Example', 8: 'Sam Example' };
const NAMED = "The owner account is Pat Example; you're signed in as Sam Example.";

// The plan table stand-in, plus the two name lookups ownerNamesFor makes.
function namedDb() {
  const db = fakePlanDb({ members: { 'ws-1': { 7: 'owner', 8: 'member' } }, roles: { 7: 'admin', 8: 'user' } });
  const plain = db.query.bind(db);
  db.query = async (sql, params = []) => {
    if (/AS name FROM users WHERE role = 'admin'/.test(sql)) return { rows: [{ name: NAMES[7] }] };
    if (/AS name FROM users WHERE id = \$1/.test(sql)) return { rows: [{ name: NAMES[Number(params[0])] || null }] };
    return plain(sql, params);
  };
  return db;
}

const codeJob = {
  goal: 'Show the date in the header',
  project: 'Homebase',
  jobs: [{ agent: 'nexus', job: 'Add the date to the header.', checklist: ['The date shows'], kind: 'code' }],
};

async function refusal(promise) {
  try { await promise; } catch (error) { return error; }
  throw new Error('expected a refusal');
}

beforeEach(() => { logLines.length = 0; delete process.env.CENSAI_MODE; });
afterEach(() => { resetPlansForTests(); delete process.env.CENSAI_MODE; });

const ownerOnlyLines = () => logLines.filter((l) => l.name === 'owner-only').map((l) => l.message);

describe('an agent told to run a command', () => {
  const ask = (context, mode) => assertHostToolAllowed(namedDb(), { name: 'terminal_run', args: {}, context, mode });

  test('names the owner and you on this computer', async () => {
    const error = await refusal(ask({ userId: 8, atThisComputer: true }, 'local_desktop'));
    expect(error.code).toBe('COMPUTER_OWNER_ONLY');
    expect(error.message).toBe(`${OWNER_ONLY_MESSAGE} ${NAMED}`);
    expect(ownerOnlyLines()).toEqual(['refused agent tool terminal_run: not the owner']);
  });

  test('names nobody on a shared server, or when the chat did not come from this computer', async () => {
    expect((await refusal(ask({ userId: 8, atThisComputer: true }, 'private_server'))).message).toBe(OWNER_ONLY_MESSAGE);
    expect((await refusal(ask({ userId: 8 }, 'local_desktop'))).message).toBe(OWNER_ONLY_MESSAGE);
    expect(ownerOnlyLines()).toEqual(['refused agent tool terminal_run: not the owner', 'refused agent tool terminal_run: not the owner']);
  });

  test('the owner is not refused, and no log line ever carries a name', async () => {
    await expect(ask({ userId: 7, atThisComputer: true }, 'local_desktop')).resolves.toEqual({ enforced: true, userId: 7 });
    await refusal(ask({ userId: 8, atThisComputer: true }, 'local_desktop'));
    expect(JSON.stringify(logLines)).not.toMatch(/Pat|Sam|@/);
  });
});

describe('a Censai code job', () => {
  const handOff = (context) => handleCensaiPlanTool('censai', 'hand_off_jobs', codeJob, context, namedDb(), { whyNoTestsHere: async () => null });

  test('names the owner and you on this computer', async () => {
    const answer = await handOff({ workspaceId: 'ws-1', userId: 8, atThisComputer: true });
    expect(answer).toMatch(/^Error: I could not run the tests: only this computer's owner can run them\. /);
    expect(answer).toContain(NAMED);
    expect(ownerOnlyLines()).toEqual(['refused agent tool run_tests: not the owner']);
  });

  test('names nobody on a shared server', async () => {
    process.env.CENSAI_MODE = 'private_server';
    const answer = await handOff({ workspaceId: 'ws-1', userId: 8, atThisComputer: true });
    expect(answer).toMatch(/^Error: I could not run the tests: only this computer's owner can run them\. Job 1/);
    expect(answer).not.toMatch(/Pat|Sam/);
  });
});
