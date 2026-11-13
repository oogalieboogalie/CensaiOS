// A teammate's agent reads only the GitHub repos shared with them. Pat
// Example (the owner) makes a made-up GitHub repo a project, lets Atlas read
// GitHub on the board shared with Sam Example (a teammate) and gives Atlas
// the repo there. In a chat window on that board Sam asks Atlas for the
// repo's README and Atlas reads it to Sam, on both screens; asked for a
// made-up repo the board never shared, Atlas says that repo is not open for
// it on this board and names the one that is. Red team: off a
// board (a chat sent to censaiOS with no board, as a teammate's own browser
// can send it, or a run started elsewhere), a shared agent Pat gave GitHub
// reads gives Sam plain words for the README and for the repo's issues, and
// so does Atlas reading the repo as a GitHub project; the made-up GitHub is
// never asked, and for Pat both read. Sam's own requests to give the
// board's Atlas a made-up repo the board does not have, on the shared board
// and on Sam's own board, get plain words and give nothing; Sam still hands
// Atlas the board's own repo, and Pat gives the new one. The refusals are
// logged with the account number only, never the repo, the file or its words. Atlas's
// modules on the board, and GitHub Reader on it, are put back as the module
// found them. All repos, files and words are made up.

import { readWindow, spawnWindow, windowFrame } from '../../e2e/board.mjs';
import { fileAsk } from '../standinFileAsk.mjs';
import { STANDIN_GITHUB_OWNER } from '../standinGithub.mjs';
import { sideBySide } from '../sideBySide.mjs';

const README = 'Made-up readme: the bake sale plan lives in this repo.';
const PRIVATE_README = 'Made-up readme of a repo no board shared.';
const ISSUE = 'Made-up issue: order more napkins';
// A shared agent Pat made and gave GitHub reads to (not one of the built-in family).
const READER = { id: 'made-up-github-reader', name: 'Made-up GitHub Reader', tools: ['github_read_file', 'github_list_issues'] };
const OFF_BOARD = "Only this computer's owner's agents read GitHub with its key outside a board.";
// Off a board no project is shared, a GitHub one or a folder (server/tools/rbac/ownerOnlyReads.js).
const PROJECT_OFF_BOARD = "Only this computer's owner's agents work in its projects outside a board.";
const READER_PACKAGE = `/api/tool-packages/${encodeURIComponent('censai/github-reader')}/install`;
const NOT_GIVEN = 'not authorized for that repository';
// The words name the projects the board did give the agent (server/workspaces/projectRefusalWords.js).
const NOT_OPEN_HERE = 'that project is not open for me on this board';
// A project new to a board is the owner's to give its agents (server/routes/projects/newProjectOwnerOnly.js).
const NEW_PROJECT = "Only this computer's owner can give this board's agents a project that is not open on this board.";
const ATLAS_READS = [{ agentId: 'atlas', permission: 'read' }];

const msgsOf = async (page, id) => (await readWindow(page, id))?.msgs || [];
const answersAfter = (msgs, text) => {
  const at = msgs.findIndex((m) => m.from === 'me' && m.text === text);
  return at < 0 ? [] : msgs.slice(at + 1).filter((m) => m.from !== 'me');
};

async function waitForAnswer(page, id, text, ms = 45_000) {
  const until = Date.now() + ms;
  for (;;) {
    const answer = answersAfter(await msgsOf(page, id), text).find((m) => /Made-up file answer/.test(String(m.text || '')));
    if (answer) return String(answer.text);
    if (Date.now() > until) return '';
    await page.waitForTimeout(250);
  }
}

async function say(page, id, text) {
  const box = windowFrame(page, id).getByPlaceholder(/^Message /).first();
  await box.fill(text);
  await box.press('Enter');
}

let asks = 0;
/** Asks `agentId` in a chat sent with no board, as `who`: what its GitHub tool answered (from the stand-in model's log). */
async function askOffBoard(t, who, agentId, words) {
  // Numbered, so one person's answers are never read as another's.
  const said = `${words} (made-up ask ${asks += 1})`;
  t.typed.push(said);
  const res = await t.api(who, 'POST', '/api/chat', { agentId, stream: false, messages: [{ from: 'me', text: said }] });
  const results = t.model.recent().filter((r) => JSON.stringify(r.messages).includes(JSON.stringify(said).slice(1, -1)))
    .flatMap((r) => r.messages.filter((m) => m.role === 'tool').map((m) => String(m.content || '')));
  return { results, raw: String(res.text || ''), status: res.status };
}

const fail = (problems, ok) => {
  if (problems.length) throw new Error(problems.join('; '));
  return ok;
};
const said = (results) => (results.length ? `"${results.at(-1).slice(0, 100)}"` : 'no answer from its GitHub tool');

export default {
  id: 'githubReads',
  label: "A teammate's agent reads only the GitHub repos shared with them",
  async run(t) {
    const { pat, sam, check } = t;
    const stamp = Date.now().toString(36);
    const repoName = `made-up-notes-${stamp}`;
    const privateName = `made-up-private-${stamp}`;
    const repo = `${STANDIN_GITHUB_OWNER}/${repoName}`;
    const privateRepo = `${STANDIN_GITHUB_OWNER}/${privateName}`;
    t.github.seed(repoName, { 'README.md': README }, { issues: [{ number: 7, state: 'open', title: ISSUE, user: { login: STANDIN_GITHUB_OWNER } }] });
    t.github.seed(privateName, { 'README.md': PRIVATE_README });
    t.typed.push(README, PRIVATE_README, ISSUE);
    const logStart = t.serverLog().length;
    const capabilities = await t.api(pat, 'GET', `/api/agents/atlas/capabilities?workspaceId=${encodeURIComponent(t.workspaceId)}`);
    const atlasModules = capabilities.body?.modules;
    let projectId = null;
    let projectName = null;
    let installedHere = false;
    let chat = null;

    try {
      await check('walk', 'Pat makes a made-up GitHub repo a project, lets Atlas read GitHub on the shared board and gives Atlas the repo there', async () => {
        const opened = await t.api(pat, 'POST', '/api/projects/open', { repo });
        projectId = opened.body?.project?.id || null;
        projectName = opened.body?.project?.name || null;
        if (!projectId) throw new Error(`the made-up repo did not open as a project (${opened.status} ${opened.body?.error || ''})`);
        const installed = await t.api(pat, 'PUT', READER_PACKAGE, { workspaceId: t.workspaceId });
        if (installed.status >= 400) throw new Error(`GitHub Reader did not install on the board (${installed.status})`);
        installedHere = installed.status === 201;
        const equipped = await t.api(pat, 'PUT', '/api/agents/atlas/capabilities', { workspaceId: t.workspaceId, modules: ['github-reader'] });
        if (equipped.status >= 400) throw new Error(`Atlas did not get GitHub Reader (${equipped.status} ${equipped.body?.error || ''})`);
        // As when Pat wires Atlas to the project's window on the board.
        const given = await t.api(pat, 'PUT', `/api/workspaces/${encodeURIComponent(t.workspaceId)}/agent-projects/${encodeURIComponent(projectId)}`, { memberships: [{ agentId: 'atlas', permission: 'read' }], sourceId: 'made-up-board' });
        if (given.status !== 200) throw new Error(`Atlas could not be given the made-up repo (${given.status})`);
        const made = await t.api(pat, 'POST', '/api/agents', { id: READER.id, name: READER.name, role: 'Made-up helper', tool_scopes: { mode: 'custom', tools: READER.tools } });
        if (made.status >= 400) throw new Error(`Pat could not make the made-up GitHub reader agent (${made.status})`);
        return `${repo} is a project given to Atlas on the board, and Atlas has GitHub Reader there`;
      });

      await check('walk', "in a chat window on the shared board, Sam asks Atlas for the repo's README and Atlas reads it to Sam; Pat sees the same", async ({ shot }) => {
        if (!projectId) throw new Error('the made-up repo was not given to Atlas in the step before');
        chat = await spawnWindow(pat.page, 'chat', { agentId: 'atlas' }, { x: 40, y: 64 }, { w: 640, h: 560 });
        await windowFrame(sam.page, chat).getByPlaceholder(/^Message /).first().waitFor({ timeout: 20_000 });
        const ask = fileAsk(repo, 'README.md', 'github_read_file');
        t.typed.push(ask);
        await say(sam.page, chat, ask);
        const answer = await waitForAnswer(sam.page, chat, ask);
        const patSees = await waitForAnswer(pat.page, chat, ask, 15_000);
        await windowFrame(sam.page, chat).getByText(README).first().waitFor({ timeout: 10_000 }).catch(() => {});
        await sideBySide(t, 'sam-reads-the-shared-repo-on-the-board', shot);
        const problems = [];
        if (!answer.includes(README)) problems.push(`Atlas answered Sam ${answer ? `"${answer.slice(0, 120)}"` : 'nothing'}`);
        if (!patSees.includes(README)) problems.push("Pat's screen does not show Atlas's answer");
        return fail(problems, `Atlas read Sam the README on the board ("${README.slice(0, 40)}…"), and Pat sees it too`);
      });

      await check('hunt', 'on the board, Sam asks Atlas for a made-up repo the board never shared: Atlas says that repo is not open for it on this board and names the one that is, and the made-up GitHub is never asked', async ({ shot }) => {
        if (!chat) throw new Error('the chat did not open in the step before');
        const readsBefore = t.github.reads().length;
        const ask = fileAsk(privateRepo, 'README.md', 'github_read_file');
        t.typed.push(ask);
        await say(sam.page, chat, ask);
        const answer = await waitForAnswer(sam.page, chat, ask);
        await windowFrame(sam.page, chat).getByText(NOT_GIVEN).first().waitFor({ timeout: 10_000 }).catch(() => {});
        await sideBySide(t, 'atlas-says-no-for-a-repo-the-board-never-shared', shot);
        const asked = t.github.reads().slice(readsBefore).filter(([, name]) => name === privateName);
        const problems = [];
        if (answer.includes(PRIVATE_README)) problems.push('Atlas read Sam the repo the board never shared');
        else if (!answer.includes(NOT_GIVEN)) problems.push(`Atlas answered ${answer ? `"${answer.slice(0, 120)}"` : 'nothing'}`);
        else if (!answer.includes(NOT_OPEN_HERE) || !answer.includes(`"${repo}"`) || answer.includes('none is open for me')) {
          problems.push(`Atlas's words do not name the repo the board gave it: "${answer.slice(answer.indexOf('Tell the person'), answer.indexOf('Tell the person') + 160)}"`);
        }
        if (asked.length) problems.push(`the made-up GitHub was asked ${asked.map(([method, , what]) => `${method} ${what}`).join(', ')}`);
        return fail(problems, `Atlas answered that repo is not open for it on this board and named the one that is (${repo}); GitHub was not asked`);
      });

      await check('redteam', "off a board, the shared agent Pat gave GitHub reads gives Sam plain words for the README and the issues, and the made-up GitHub is never asked; for Pat it reads both", async () => {
        const problems = [];
        const readsBefore = t.github.reads().length;
        for (const [what, ask] of [['the README', fileAsk(repo, 'README.md', 'github_read_file')], ['the issues', fileAsk(repo, '', 'github_list_issues')]]) {
          const { results, raw } = await askOffBoard(t, sam, READER.id, ask);
          if (raw.includes(README) || raw.includes(ISSUE) || results.some((r) => r.includes(README) || r.includes(ISSUE))) problems.push(`Sam's agent got ${what}`);
          else if (!results.some((r) => r.includes(OFF_BOARD))) problems.push(`Sam's agent asking for ${what} got ${said(results)}`);
        }
        const asked = t.github.reads().slice(readsBefore).filter(([, name]) => name === repoName);
        if (asked.length) problems.push(`the made-up GitHub was asked ${asked.length} time(s) for Sam`);
        const file = await askOffBoard(t, pat, READER.id, fileAsk(repo, 'README.md', 'github_read_file'));
        if (!file.results.some((r) => r.includes(README))) problems.push(`Pat's agent reading the README got ${said(file.results)}`);
        const issues = await askOffBoard(t, pat, READER.id, fileAsk(repo, '', 'github_list_issues'));
        if (!issues.results.some((r) => r.includes(ISSUE))) problems.push(`Pat's agent listing the issues got ${said(issues.results)}`);
        return fail(problems, `Sam's agent gets "${OFF_BOARD}" for both and GitHub is not asked; Pat's agent reads the README and the issue`);
      });

      await check('redteam', "off a board, Atlas reading the made-up repo as a GitHub project gives Sam plain words, and the made-up GitHub is never asked; for Pat it reads the README", async () => {
        if (!projectName) throw new Error('the made-up repo did not open as a project in the first step');
        const problems = [];
        const readsBefore = t.github.reads().length;
        const ask = fileAsk(projectName, 'README.md', 'project_read');
        const forSam = await askOffBoard(t, sam, 'atlas', ask);
        if (forSam.raw.includes(README) || forSam.results.some((r) => r.includes(README))) problems.push("Sam's Atlas got the README");
        else if (!forSam.results.some((r) => r.includes(PROJECT_OFF_BOARD))) problems.push(`Sam's Atlas got ${said(forSam.results)}`);
        const asked = t.github.reads().slice(readsBefore).filter(([, name]) => name === repoName);
        if (asked.length) problems.push(`the made-up GitHub was asked ${asked.length} time(s) for Sam`);
        const forPat = await askOffBoard(t, pat, 'atlas', ask);
        if (!forPat.results.some((r) => r.includes(README))) problems.push(`Pat's Atlas got ${said(forPat.results)}`);
        return fail(problems, `Sam's Atlas gets "${PROJECT_OFF_BOARD}" and GitHub is not asked; Pat's Atlas reads the README`);
      });

      await check('redteam', "Sam's own requests to give the board's Atlas a made-up repo the board does not have, on the shared board and on Sam's own board, get plain words and give nothing, a project that is not there too; Sam still hands Atlas the board's own repo, and Pat gives the new one", async () => {
        if (!projectId) throw new Error('the made-up repo was not given to Atlas in the first step');
        const opened = await t.api(pat, 'POST', '/api/projects/open', { repo: privateRepo });
        const privateId = opened.body?.project?.id;
        if (!privateId) throw new Error(`the second made-up repo did not open as a project (${opened.status} ${opened.body?.error || ''})`);
        const own = await t.api(sam, 'POST', '/api/workspaces/personal');
        const samBoard = own.body?.workspace?.id;
        if (!samBoard) throw new Error(`could not find Sam's own board (${own.status})`);
        const onBoard = (board) => `/api/workspaces/${encodeURIComponent(board)}/agent-projects`;
        const giveTo = (who, board, id) => t.api(who, 'PUT', `${onBoard(board)}/${encodeURIComponent(id)}`, { memberships: ATLAS_READS, sourceId: 'made-up-board' });
        const atlasHas = async (who, board, id) => ((await t.api(who, 'GET', `${onBoard(board)}?agentId=atlas`)).body?.memberships || []).some((m) => m.projectId === id);
        const problems = [];
        for (const [where, board, id] of [['the shared board', t.workspaceId, privateId], ["Sam's own board", samBoard, privateId], ['the shared board, for a project that is not there', t.workspaceId, `shared-made-up-nothing-${stamp}`]]) {
          const res = await giveTo(sam, board, id);
          if (res.status !== 403 || !String(res.body?.error || '').startsWith(NEW_PROJECT)) problems.push(`on ${where} Sam's request answered ${res.status} ${String(res.body?.error || '').slice(0, 80)}`);
          if (await atlasHas(sam, board, id)) problems.push(`on ${where} Atlas was given the made-up repo`);
        }
        const keep = await giveTo(sam, t.workspaceId, projectId);
        if (keep.status !== 200) problems.push(`Sam handing Atlas the board's own repo answered ${keep.status}`);
        const byPat = await giveTo(pat, t.workspaceId, privateId);
        if (byPat.status !== 200 || !(await atlasHas(pat, t.workspaceId, privateId))) problems.push(`Pat giving Atlas the new repo answered ${byPat.status}`);
        // Back to the board as the first step left it.
        await giveTo(pat, t.workspaceId, projectId);
        return fail(problems, `Sam gets 403 "${NEW_PROJECT}" on both boards, for a project that is not there too, and Atlas is given nothing; Sam still hands Atlas the board's own repo; Pat gives the new one`);
      });

      await check('redteam', "the refusals are logged with the account number only, never the repo, the file or its words", async () => {
        const added = t.serverLog().slice(logStart);
        const refusals = added.split('\n').filter((line) => line.includes('off a board') || line.includes("a board's agents a new project"));
        const problems = [];
        if (!refusals.length) problems.push('the server log has no line for the refusals');
        for (const [what, words] of [['the repo', repoName], ['the file', 'README.md'], ['its words', README], ['an issue', ISSUE]]) {
          if (refusals.some((line) => line.includes(words))) problems.push(`a refusal line names ${what}`);
        }
        return fail(problems, `${refusals.length} refusal lines (for example "${refusals[0]?.replace(/^\S+\s+/, '').slice(0, 90)}"), none naming the repo, a file or its words`);
      });
    } finally {
      if (Array.isArray(atlasModules)) await t.api(pat, 'PUT', '/api/agents/atlas/capabilities', { workspaceId: t.workspaceId, modules: atlasModules }).catch(() => {});
      if (projectId) await t.api(pat, 'PUT', `/api/workspaces/${encodeURIComponent(t.workspaceId)}/agent-projects/${encodeURIComponent(projectId)}`, { memberships: [], sourceId: 'made-up-board' }).catch(() => {});
      if (installedHere) await t.api(pat, 'DELETE', `${READER_PACKAGE}?workspaceId=${encodeURIComponent(t.workspaceId)}`).catch(() => {});
    }
  },
};
