// The Grok chat's own sign-in, the way a person uses it. Pat Example (the
// owner) opens a Chat from Add, picks Grok (grok-4) from its model chip and
// then "My Grok sign-in", and signs in: the server runs a stand-in for xAI's
// Grok CLI (tests/fixtures/cli-agents/standin-grok.mjs), which prints what
// the real one prints, a link with the code already in it, and calls the
// sign-in approved 8 seconds later. The box gives the link, asks Pat to check
// that the page shows the code (not to type it in), and changes by itself
// once the sign-in is approved; Pat's made-up question then goes through
// Pat's own Grok sign-in, with no xAI key. Sam Example (a teammate on the
// shared board) sees Pat's question and answer, and Sam's open copy of the
// chat shows grok-4 and Grok's bar with no reload; after a reload Sam is
// asked to sign in with their own Grok account, gets their own box with the
// same wording, and once approved chats on their own sign-in. Bug hunt: Sam's
// message through the sign-in before Sam signs in is refused, never answered
// on Pat's sign-in; Sam's question starts Sam's own Grok conversation, handed
// the chat so far, and Pat's next one picks up Pat's own, handed what Sam
// said meanwhile (the stand-in says which conversation it is in, what it was
// handed and who that came from); each person's screen shows the other's
// messages under the other's name, each Grok is handed them under that name,
// and when Pat and Sam say the same made-up thanks, Pat's Grok is still
// handed Sam's, as Sam's; Pat signs out from the bar and the chat asks Pat to
// sign in again. Red team: the chat window everyone shares holds no one's Grok
// conversation, Sam signing out leaves Pat signed in, a Grok turn that fails
// shows Grok's own words (naming a file in Pat's Grok folder) in Pat's chat
// but never in censaiOS's logs, a signed-out visitor can neither start a Grok
// sign-in nor read one, and the sign-in's code and link never land in
// censaiOS's logs. The chat's agent goes back to its own
// model at the end and everyone is signed out of Grok. All accounts are made
// up.

import fs from 'node:fs';
import path from 'node:path';
import { PAT, SAM, openBoard, readWindow, windowFrame } from '../../e2e/board.mjs';
import { addFromMenu } from '../addMenu.mjs';

// What the stand-in prints, as xAI's `grok login --device-auth` (1.0.70) does.
const CODE = 'WXYZ-4821';
const LINK = `https://accounts.x.ai/oauth2/device?user_code=${CODE}`;
const CHECK_STEP = `Check that the page shows this code: ${CODE}`;
const APPROVE = 'Approve with your Grok account. This box changes by itself when you are in.';
const SIGNED_IN = 'Your own Grok plan, no API cost.';
const GROK = '/api/cli-agents/grok-signin';
const QUESTION = 'Made-up question for Grok: which herbs grow well on a windowsill?';
const SAM_EARLY = 'Made-up early message from Sam before signing in';
const SAM_QUESTION = 'Made-up question from Sam for Grok: and which need the most light?';
const PAT_AGAIN = 'Made-up question from Pat for Grok: and which of those grow fastest?';
// Pat and Sam each say these very words.
const THANKS = 'Made-up thanks for the herb tips, Grok';
const PAT_LAST = 'Made-up last question from Pat for Grok: how often to water basil?';
const VISITOR = 'Made-up message from a signed-out visitor';
// The stand-in fails a turn that asks it to, with an error naming a file in that person's own Grok folder.
const FAILING = 'Made-up question for Grok that it cannot answer [stand-in fails this turn]';
const GROK_WORDS = ['Made-up trouble reading', 'made-up-notes.txt'];
// The stand-in's answer names the sign-in it ran on (here after each person's
// own Grok folder) and says whether it was handed an API key.
const ANSWER = /Grok here, on the Grok sign-in of/;
const signInOf = (said) => said.match(/on the Grok sign-in of ([^.\s]+)\./)?.[1] || null;
// The stand-in starts each answer with the conversation it is in, and what the chat handed it.
const conversationOf = (said) => said.match(/(Starting a|Picking up our) conversation \(([^)]+)\)/)?.slice(1) || [null, null];
const handedOf = (said) => said.match(/I was handed (the chat so far \((\d+) messages\)|(\d+) messages said meanwhile)/) || null;
// ...and who what it was handed came from: "you" (the person asking), "Grok", or a teammate's name.
const cameFrom = (said) => said.match(/They came from ([^.]+)\./)?.[1] || null;

const flat = (text) => String(text || '').replace(/\s+/g, ' ').trim();
const oneLine = (text) => flat(text).slice(0, 200);

async function say(page, id, text) {
  const box = windowFrame(page, id).getByPlaceholder(/^Message /).first();
  await box.fill(text);
  await box.press('Enter');
}

/**
 * The whole answer that echoes `asked`, as this person's screen shows it once
 * it has all come in; with `signIn`, the one given on that person's sign-in.
 */
async function answerTo(page, id, asked, signIn = null) {
  const answers = windowFrame(page, id).getByText(ANSWER).filter({ hasText: asked.slice(0, 40) }).filter({ hasText: 'API key in my environment' });
  const answer = (signIn ? answers.filter({ hasText: `on the Grok sign-in of ${signIn}.` }) : answers).first();
  await answer.waitFor({ timeout: 30_000 });
  // The ▍ mark trails an answer while it is still coming in.
  for (let tries = 0; tries < 40 && (await answer.innerText()).includes('▍'); tries += 1) await page.waitForTimeout(250);
  return flat(await answer.innerText());
}

/** A person's message on this person's screen, and the name it shows ('' for none). */
async function messageOn(page, id, text) {
  const bubble = windowFrame(page, id).locator('.hb-msg[data-from="me"]').filter({ hasText: text }).first();
  await bubble.waitFor({ timeout: 15_000 });
  const name = bubble.getByTestId('chat-message-writer');
  return { bubble, writer: (await name.count()) ? oneLine(await name.innerText()) : '' };
}

/** Every file censaiOS logged to in this run, as one text. */
function allLogs(logDir) {
  return fs.readdirSync(logDir, { recursive: true })
    .map((name) => path.join(logDir, String(name)))
    .filter((file) => fs.statSync(file).isFile())
    .map((file) => fs.readFileSync(file, 'utf8'))
    .join('\n');
}

/** Starts the sign-in from the chat's card and reads the steps its box gives. */
async function startSignIn(page, id) {
  const frame = windowFrame(page, id);
  await frame.getByRole('button', { name: 'Sign in to Grok' }).click({ timeout: 15_000 });
  const box = frame.getByTestId('grok-signin-waiting');
  await box.getByRole('link').waitFor({ timeout: 20_000 });
  const link = box.getByRole('link');
  return { steps: await box.locator('li').allInnerTexts(), href: await link.getAttribute('href'), target: await link.getAttribute('target') };
}

function checkSteps({ steps, href, target }) {
  const want = [`Open ${LINK}`, CHECK_STEP, APPROVE];
  if (JSON.stringify(steps.map(oneLine)) !== JSON.stringify(want)) throw new Error(`the box's steps are: ${steps.map(oneLine).join(' / ')}`);
  if (href !== LINK || target !== '_blank') throw new Error(`the link goes to ${href} (target ${target}), not ${LINK} in a new tab`);
  return `the box says: ${steps.map(oneLine).join(' / ')}`;
}

export default {
  id: 'grokSignIn',
  label: 'Grok chat: sign in with your own Grok account',
  async run(t) {
    const { pat, sam, check } = t;
    t.typed.push(QUESTION, SAM_EARLY, SAM_QUESTION, PAT_AGAIN, THANKS, PAT_LAST, VISITOR, FAILING);
    let chat = null;
    let agentBefore = null;
    let patConversation = null;
    let patSignIn = null;
    let samSignIn = null;
    // The sign-in folder outlives a module run, so each run starts with nobody signed in.
    for (const who of [pat, sam]) await t.api(who, 'POST', `${GROK}/logout`);
    try {
      await check('walk', 'Pat opens a Chat from Add and picks Grok from the model chip: the chat offers Pat\'s own Grok sign-in', async ({ shot }) => {
        const opened = await addFromMenu(pat.page, 'Chat');
        if (opened.kind !== 'chat') throw new Error(`the Add menu opened ${opened.kind || 'nothing'}, not Chat`);
        chat = opened.id;
        const { agentId } = await readWindow(pat.page, chat);
        const before = await t.api(pat, 'GET', `/api/agents/${encodeURIComponent(agentId)}`);
        if (before.status >= 400) throw new Error(`the chat's agent could not be read (${before.status})`);
        agentBefore = before.body;
        const frame = windowFrame(pat.page, chat);
        await frame.getByTestId('chat-capabilities').click({ timeout: 10_000 });
        await frame.getByRole('menuitemradio', { name: 'grok-4', exact: true }).click({ timeout: 5_000 });
        const bar = frame.getByTestId('grok-source');
        await bar.waitFor({ timeout: 15_000 });
        const said = oneLine(await bar.innerText());
        await shot(pat.page, 'a-grok-chat-offers-the-sign-in');
        const missing = ['Grok runs on', 'My Grok sign-in', 'xAI key'].filter((words) => !said.includes(words));
        if (missing.length) throw new Error(`the bar says "${said}", with no "${missing[0]}"`);
        return `${agentBefore.name}'s chat now answers with grok-4, and its bar says: ${said}`;
      });

      await check('walk', 'Pat picks My Grok sign-in and signs in: the box gives the link and asks Pat to check the code on the page, not to type it in', async ({ shot }) => {
        const frame = windowFrame(pat.page, chat);
        await frame.getByRole('radio', { name: 'My Grok sign-in' }).click({ timeout: 10_000 });
        const card = frame.getByTestId('grok-signin');
        await card.waitFor({ timeout: 15_000 });
        const asked = oneLine(await card.innerText());
        const box = await startSignIn(pat.page, chat);
        await shot(pat.page, 'pat-is-asked-to-check-the-code');
        if (!asked.includes('Sign in with your own Grok account')) throw new Error(`the card before signing in says "${asked}"`);
        return checkSteps(box);
      });

      await check('walk', 'once x.ai approves (the stand-in does after 8 seconds), Pat\'s box changes by itself: Grok runs on Pat\'s own plan', async ({ shot }) => {
        const frame = windowFrame(pat.page, chat);
        await frame.getByText(SIGNED_IN).waitFor({ timeout: 30_000 });
        await shot(pat.page, 'pat-is-signed-in');
        if (await frame.getByTestId('grok-signin-waiting').count()) throw new Error('the sign-in box is still there beside the signed-in note');
        const status = await t.api(pat, 'GET', `${GROK}/status`);
        if (!status.body?.signedIn) throw new Error(`the server says Pat is not signed in (${status.status})`);
        return `with no click, the box gave way to "${SIGNED_IN}" and a Sign out button`;
      });

      await check('walk', 'Pat asks Grok a made-up question: the answer comes through Pat\'s own Grok sign-in, with no xAI key', async ({ shot }) => {
        await say(pat.page, chat, QUESTION);
        const said = await answerTo(pat.page, chat, QUESTION);
        patConversation = conversationOf(said)[1];
        patSignIn = signInOf(said);
        await shot(pat.page, 'grok-answers-pat');
        if (!said.includes('API key in my environment: none') || !patSignIn) throw new Error(`the answer says: ${said}`);
        return said;
      });

      await check('hunt', 'Sam\'s open copy of the chat shows the model Pat picked, and Grok\'s bar, with no reload', async ({ shot }) => {
        const frame = windowFrame(sam.page, chat);
        await frame.getByText(ANSWER).first().waitFor({ timeout: 20_000 });
        const bar = frame.getByTestId('grok-source');
        await bar.waitFor({ timeout: 10_000 }).catch(() => {});
        const chip = oneLine(await frame.getByTestId('chat-capabilities').innerText());
        await shot(sam.page, 'sam-sees-the-model-pat-picked');
        if (!chip.startsWith('grok-4')) throw new Error(`Sam sees Pat's question and answer, but Sam's open copy of the chat still shows "${chip}", not grok-4`);
        if (!await bar.count()) throw new Error(`Sam's chat shows ${chip} but no "Grok runs on" bar`);
        return `with no reload, Sam's chat shows ${chip} and its bar says: ${oneLine(await bar.innerText())}`;
      });

      await check('walk', 'Sam reloads the board: Sam\'s copy of the chat keeps Pat\'s answer and asks Sam to sign in with Sam\'s own Grok account', async ({ shot }) => {
        await openBoard(sam.page, t.workspaceId, t.web);
        const frame = windowFrame(sam.page, chat);
        const card = frame.getByTestId('grok-signin');
        await card.waitFor({ timeout: 20_000 }).catch(() => {});
        const seen = await frame.getByText(ANSWER).first().waitFor({ timeout: 10_000 }).then(() => true, () => false);
        await shot(sam.page, 'sam-is-asked-to-sign-in');
        const bar = frame.getByTestId('grok-source');
        if (!await bar.count()) throw new Error(`Sam's copy of the chat has no "Grok runs on" bar; it shows: ${oneLine(await frame.innerText())}`);
        if (!await card.count()) throw new Error(`Sam's bar says "${oneLine(await bar.innerText())}", with no card to sign in`);
        const said = oneLine(await card.innerText());
        if (!said.includes('teammates sign in with their own')) throw new Error(`Sam's card says "${said}"`);
        if (!seen) throw new Error('Sam does not see Pat\'s answer from Grok');
        return `Sam sees Pat's question and answer; Sam's card says: ${said}`;
      });

      await check('hunt', 'Sam\'s message through the sign-in before Sam signs in is refused, never answered on Pat\'s sign-in', async () => {
        const res = await t.api(sam, 'POST', `${GROK}/chat`, { text: SAM_EARLY });
        if (res.status < 400 || res.body?.code !== 'GROK_SIGNIN_REQUIRED') throw new Error(`answered ${res.status}: ${oneLine(res.text)}`);
        return `refused (${res.status}): ${res.body.error}`;
      });

      await check('walk', 'Sam signs in with their own Grok account: Sam\'s box asks Sam to check the code too, and changes by itself once approved', async ({ shot }) => {
        const box = await startSignIn(sam.page, chat);
        await shot(sam.page, 'sam-is-asked-to-check-the-code');
        await windowFrame(sam.page, chat).getByText(SIGNED_IN).waitFor({ timeout: 30_000 });
        return `${checkSteps(box)}; then, with no click, "${SIGNED_IN}"`;
      });

      let samSaid = '';
      await check('walk', 'Sam asks Grok a made-up question: the answer comes through Sam\'s own Grok sign-in, with no xAI key', async ({ shot }) => {
        await say(sam.page, chat, SAM_QUESTION);
        samSaid = await answerTo(sam.page, chat, SAM_QUESTION);
        await shot(sam.page, 'grok-answers-sam');
        if (!samSaid.includes('API key in my environment: none')) throw new Error(`Sam's answer says: ${samSaid}`);
        samSignIn = signInOf(samSaid);
        if (!samSignIn || samSignIn === patSignIn) throw new Error(`Sam's answer ran on the sign-in "${samSignIn}", Pat's is "${patSignIn}": ${samSaid}`);
        return `on Sam's own sign-in ("${samSignIn}"; Pat's is "${patSignIn}"): ${samSaid}`;
      });

      let samConversation = null;
      await check('hunt', 'Sam\'s question starts Sam\'s own Grok conversation, not Pat\'s, handed the chat so far', async () => {
        if (!samSaid) throw new Error('Sam got no answer to look at');
        const [how, id] = conversationOf(samSaid);
        if (!patConversation) throw new Error('Pat\'s answer did not say which conversation it started');
        if (how !== 'Starting a' || id === patConversation) throw new Error(`Sam's Grok was asked to pick up the conversation ${id}, ${id === patConversation ? 'the one Pat\'s Grok started' : 'not one of its own'}: ${samSaid}`);
        const handed = handedOf(samSaid);
        if (!handed?.[2] || Number(handed[2]) < 2) throw new Error(`Sam's Grok was not handed Pat's question and answer: ${samSaid}`);
        samConversation = id;
        return `Sam's Grok started its own conversation (${id}; Pat's is ${patConversation}), handed the chat so far (${handed[2]} messages)`;
      });

      let patAgain = '';
      await check('walk', 'Pat writes again: Pat\'s Grok picks up Pat\'s own conversation, handed what Sam said meanwhile', async ({ shot }) => {
        // Pat writes once Pat's own screen shows Sam's question and its answer.
        await answerTo(pat.page, chat, SAM_QUESTION);
        await say(pat.page, chat, PAT_AGAIN);
        const said = await answerTo(pat.page, chat, PAT_AGAIN);
        patAgain = said;
        await shot(pat.page, 'pat-picks-up-own-conversation');
        const [how, id] = conversationOf(said);
        if (how !== 'Picking up our' || id !== patConversation) throw new Error(`Pat's Grok ${how === 'Picking up our' ? `picked up ${id}` : `started ${id}`}, not Pat's own conversation ${patConversation}: ${said}`);
        if (signInOf(said) !== patSignIn) throw new Error(`Pat's answer ran on the sign-in "${signInOf(said)}", not Pat's "${patSignIn}"`);
        const handed = handedOf(said);
        if (handed?.[3] !== '2') throw new Error(`Pat's Grok was not handed just Sam's question and its answer: ${said}`);
        return `picked up Pat's own conversation (${id}; Sam's is ${samConversation}), handed ${handed[3]} messages said meanwhile`;
      });

      await check('hunt', 'each person\'s screen shows the other\'s messages under the other\'s name, and their own under none', async ({ shot }) => {
        const shown = {
          patSeesSam: await messageOn(pat.page, chat, SAM_QUESTION),
          patSeesOwn: await messageOn(pat.page, chat, PAT_AGAIN),
          samSeesPat: await messageOn(sam.page, chat, PAT_AGAIN),
          samSeesOwn: await messageOn(sam.page, chat, SAM_QUESTION),
        };
        const seen = Object.fromEntries(Object.entries(shown).map(([who, { writer }]) => [who, writer]));
        // Each picture shows the other person's message where it sits in the chat.
        await shown.patSeesSam.bubble.scrollIntoViewIfNeeded();
        await shot(pat.page, 'pat-sees-sams-name');
        await shown.samSeesPat.bubble.scrollIntoViewIfNeeded();
        await shot(sam.page, 'sam-sees-pats-name');
        if (seen.patSeesSam !== SAM.name) throw new Error(`on Pat's screen, Sam's question is under ${seen.patSeesSam ? `"${seen.patSeesSam}"` : 'no name'}`);
        if (seen.samSeesPat !== PAT.name) throw new Error(`on Sam's screen, Pat's question is under ${seen.samSeesPat ? `"${seen.samSeesPat}"` : 'no name'}`);
        if (seen.patSeesOwn || seen.samSeesOwn) throw new Error(`a person's own message is under a name ("${seen.patSeesOwn || seen.samSeesOwn}")`);
        return `Pat's screen shows Sam's question under "${seen.patSeesSam}", Sam's shows Pat's under "${seen.samSeesPat}", and each person's own under no name`;
      });

      await check('hunt', 'each person\'s Grok is handed the other\'s messages under the other\'s name, never as its own person\'s', async () => {
        if (!samSaid || !patAgain) throw new Error('Pat or Sam got no answer to look at');
        const toSam = cameFrom(samSaid);
        const toPat = cameFrom(patAgain);
        if (toSam !== `${PAT.name} and Grok`) throw new Error(`Sam's Grok says the chat so far came from ${toSam || 'no one'}: ${samSaid}`);
        if (toPat !== `${SAM.name} and Grok`) throw new Error(`Pat's Grok says what was said meanwhile came from ${toPat || 'no one'}: ${patAgain}`);
        return `Sam's Grok says the chat so far came from ${toSam}; Pat's says what was said meanwhile came from ${toPat}`;
      });

      await check('hunt', 'Pat and Sam each say the same made-up thanks: Pat\'s Grok is still handed Sam\'s, as Sam\'s', async ({ shot }) => {
        await say(pat.page, chat, THANKS);
        await answerTo(pat.page, chat, THANKS, patSignIn);
        // Sam writes once Sam's own screen shows Pat's thanks and its answer.
        await answerTo(sam.page, chat, THANKS, patSignIn);
        await say(sam.page, chat, THANKS);
        await answerTo(sam.page, chat, THANKS, samSignIn);
        await answerTo(pat.page, chat, THANKS, samSignIn);
        await say(pat.page, chat, PAT_LAST);
        const said = await answerTo(pat.page, chat, PAT_LAST);
        await shot(pat.page, 'pat-is-handed-sams-thanks');
        const handed = handedOf(said);
        if (handed?.[3] !== '2' || cameFrom(said) !== `${SAM.name} and Grok`) throw new Error(`after Sam's thanks, Pat's Grok was not handed it and its answer: ${said}`);
        return `Pat said "${THANKS}", then Sam said it too; Pat's next question was handed ${handed[3]} messages said meanwhile, from ${cameFrom(said)}`;
      });

      await check('redteam', 'the chat window everyone on the board shares holds no one\'s Grok conversation', async () => {
        const shared = await readWindow(pat.page, chat);
        if (!shared) throw new Error('the chat window could not be read');
        // The stand-in's answers name their own conversation, and the window keeps each
        // answer (in its messages and its last run), so only that sentence is left out of the search.
        const held = JSON.stringify(shared).replace(/(Starting a|Picking up our) conversation \([^)]*\)/g, '');
        const found = [patConversation, samConversation].filter((id) => id && held.includes(id));
        if ('grokSessionId' in shared || found.length) throw new Error(`the shared window holds a Grok conversation (${found[0] || shared.grokSessionId})`);
        return 'the window holds neither Pat\'s nor Sam\'s conversation; each is kept in that person\'s own Grok folder on the server';
      });

      await check('redteam', 'Sam signing out signs out only Sam: Pat stays signed in', async () => {
        await t.api(sam, 'POST', `${GROK}/logout`);
        const [mine, theirs] = await Promise.all([t.api(sam, 'GET', `${GROK}/status`), t.api(pat, 'GET', `${GROK}/status`)]);
        if (mine.body?.signedIn !== false) throw new Error(`Sam is still signed in after signing out (${mine.status})`);
        if (theirs.body?.signedIn !== true) throw new Error(`Sam's sign-out signed Pat out too (${theirs.status})`);
        return 'Sam is signed out; Pat is still signed in';
      });

      await check('redteam', 'a Grok turn that fails shows Grok\'s own words in Pat\'s chat, never in censaiOS\'s logs', async ({ shot }) => {
        // The server logs the failed turn, and Pat's board sends its own line for it a few seconds later.
        const SERVER_LINE = 'grok chat failed';
        const BOARD_LINE = 'Grok sign-in chat failed';
        const count = (text, words) => text.split(words).length - 1;
        const before = allLogs(t.logDir);
        const was = { server: count(before, SERVER_LINE), board: count(before, BOARD_LINE) };
        await say(pat.page, chat, FAILING);
        const stopped = windowFrame(pat.page, chat).getByText(/Grok stopped: Made-up trouble reading/).first();
        await stopped.waitFor({ timeout: 30_000 });
        const shown = oneLine(await stopped.innerText());
        await shot(pat.page, 'a-failed-grok-turn');
        if (!GROK_WORDS.every((words) => shown.includes(words))) throw new Error(`Pat's chat says "${shown}"`);
        let text = '';
        for (let tries = 0; tries < 40; tries += 1) {
          text = allLogs(t.logDir);
          if (count(text, SERVER_LINE) > was.server && count(text, BOARD_LINE) > was.board) break;
          await pat.page.waitForTimeout(500);
        }
        const found = GROK_WORDS.filter((words) => text.includes(words));
        if (found.length) throw new Error(`the logs hold Grok's own words ("${found[0]}")`);
        const lines = text.split('\n');
        // The app log's own record (a JSON line) rather than the server's console copy of it.
        const server = lines.filter((logged) => logged.includes(SERVER_LINE)).sort((a, b) => a.startsWith('{') - b.startsWith('{')).pop();
        const board = lines.filter((logged) => logged.includes(BOARD_LINE)).pop();
        if (count(text, BOARD_LINE) <= was.board || !board?.includes('GROK_CHAT_FAILED')) throw new Error(board ? `the board's line says: ${oneLine(board)}` : 'the board sent no line for the failed turn');
        if (!server?.includes('grok_said_error')) throw new Error(server ? `the failed turn's server line says: ${oneLine(server)}` : 'the server logged no line for the failed turn');
        const meta = (() => { try { return JSON.parse(server).meta; } catch { return null; } })();
        return `Pat's chat says "${shown}"; the server's line says only ${meta ? JSON.stringify({ code: meta.code, how: meta.how, exit: meta.exit }) : 'how it ended'}, and the board's says "${BOARD_LINE}: GROK_CHAT_FAILED"`;
      });

      await check('hunt', 'Pat signs out from the bar: the chat asks Pat to sign in again', async ({ shot }) => {
        const frame = windowFrame(pat.page, chat);
        await frame.getByRole('button', { name: 'Sign out' }).click({ timeout: 10_000 });
        const card = frame.getByTestId('grok-signin');
        await card.waitFor({ timeout: 15_000 });
        await shot(pat.page, 'pat-signed-out');
        const status = await t.api(pat, 'GET', `${GROK}/status`);
        if (status.body?.signedIn !== false) throw new Error(`the server still says Pat is signed in (${status.status})`);
        return `the card is back: ${oneLine(await card.innerText())}`;
      });

      await check('redteam', 'a signed-out visitor can neither start a Grok sign-in nor read one', async () => {
        const visitor = { ctx: t.signedOut };
        const tries = await Promise.all([
          t.api(visitor, 'GET', `${GROK}/status`),
          t.api(visitor, 'POST', `${GROK}/login`),
          t.api(visitor, 'POST', `${GROK}/chat`, { text: VISITOR }),
        ]);
        const open = tries.filter((res) => res.status < 400 || res.text.includes(CODE));
        if (open.length) throw new Error(`answered ${open.map((res) => res.status).join(', ')}: ${oneLine(open[0].text)}`);
        return `refused: ${tries.map((res) => res.status).join(', ')}`;
      });

      await check('redteam', 'the sign-in\'s code and link never land in censaiOS\'s logs', async () => {
        const text = allLogs(t.logDir);
        const found = [CODE, 'user_code='].filter((words) => text.includes(words));
        if (found.length) throw new Error(`the logs hold "${found[0]}"`);
        return 'neither the code nor the link is in the server or app logs';
      });
    } finally {
      for (const who of [pat, sam]) await t.api(who, 'POST', `${GROK}/logout`);
      // Later modules find the chat's agent on the model it had. The app saves a
      // built-in agent's model the same way when its own save is refused (src/lib/api/agents.js).
      if (agentBefore?.id) {
        await check('walk', 'the chat\'s agent is put back on the model it had', async () => {
          const was = { model_provider: agentBefore.model_provider ?? null, model_name: agentBefore.model_name ?? null };
          const url = `/api/agents/${encodeURIComponent(agentBefore.id)}`;
          await t.api(pat, 'PATCH', `${url}/config`, was);
          const now = (await t.api(pat, 'GET', url)).body || {};
          if (now.model_provider !== was.model_provider || now.model_name !== was.model_name) {
            throw new Error(`${agentBefore.name} is on ${now.model_provider}/${now.model_name}, not ${was.model_provider}/${was.model_name}`);
          }
          return `${agentBefore.name} is back on ${was.model_name || 'its default model'}`;
        });
      }
    }
  },
};
