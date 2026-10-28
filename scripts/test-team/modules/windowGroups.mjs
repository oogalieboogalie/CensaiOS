// Window groups: Pat groups three windows (one is a chat), saves the group on
// Ctrl+1, opens it full screen with F1 and leaves with Escape, clicks the chat
// inside the group (it must keep its grouped size and place), picks a common
// layout, and Sam sees the same group on the shared board. Then the wrong
// things: F-keys with no saved group, Escape twice, ungrouping one window.
// Red team: a group name made of script text.
// On the normal board (not full screen) the chat keeps its grouped size and
// place through a click, a header click, typing, a group drag, a reload and
// Alt+1, F1 and Escape; Sam clicking the chat does not change Pat's screen.

import { openBoard, readWindow, spawnWindow, updateWindow, windowFrame } from '../../e2e/board.mjs';
import { note } from '../report.mjs';

const state = (page) => page.evaluate(() => {
  const s = window.__e2eStore.getState();
  return JSON.parse(JSON.stringify({
    wins: s.wins.map(({ id, x, y, w, h, groupId }) => ({ id, x, y, w, h, groupId: groupId || null })),
    groups: s.canvasGroups.map(({ id, label, x, y, w, h }) => ({ id, label, x, y, w, h })),
    focus: s.groupFocus?.groupId || null,
    view: { pan: s.pan, zoom: s.zoom },
  }));
});

async function waitUntil(page, test, ms = 5_000) {
  const until = Date.now() + ms;
  for (;;) {
    const s = await state(page);
    if (test(s)) return s;
    if (Date.now() > until) return null;
    await page.waitForTimeout(200);
  }
}

const rect = (w) => (w ? `${Math.round(w.x)},${Math.round(w.y)} ${Math.round(w.w)}x${Math.round(w.h)}` : 'gone');
const sameRect = (a, b) => a && b && ['x', 'y', 'w', 'h'].every((k) => Math.abs(a[k] - b[k]) <= 1);
const overlap = (a, b) => a.x < b.x + b.w - 1 && b.x < a.x + a.w - 1 && a.y < b.y + b.h - 1 && b.y < a.y + a.h - 1;
/** A click on the header's own bar (its left edge), not on a header button such as Scout. */
async function clickHeader(page, frame) {
  const box = await frame.locator('.hb-win-header').first().boundingBox({ timeout: 8_000 });
  if (!box) throw new Error('the header is not on screen');
  await page.mouse.click(box.x + 3, box.y + box.height / 2);
}
const sameView = (a, b) => Math.abs(a.zoom - b.zoom) < 0.001 && Math.abs(a.pan.x - b.pan.x) <= 1 && Math.abs(a.pan.y - b.pan.y) <= 1;

/** Keys go to the board itself, not a text box, the way they do after clicking empty canvas. */
const press = async (page, key) => {
  await page.evaluate(() => document.activeElement?.blur?.());
  await page.keyboard.press(key);
};

async function leaveFullScreen(page) {
  await press(page, 'Escape');
  if (await waitUntil(page, (s) => !s.focus, 1_500)) return 'Escape';
  await page.keyboard.press('Shift+Escape');
  if (await waitUntil(page, (s) => !s.focus, 1_500)) return 'Shift+Escape';
  throw new Error('neither Escape nor Shift+Escape left the full-screen group');
}

export default {
  id: 'windowGroups',
  label: 'Window groups (Ctrl+1, F1, layouts)',
  async run(t) {
    const { pat, sam, check } = t;
    const ids = {};
    let gid;
    let grouped;

    await check('walk', 'Pat groups a chat, a to-do list and an idea board and saves it on Ctrl+1', async ({ shot }) => {
      ids.chat = await spawnWindow(pat.page, 'chat', { agentId: 'censai' }, { x: 60, y: 60 }, { w: 360, h: 420 });
      ids.todos = await spawnWindow(pat.page, 'todos', {}, { x: 440, y: 60 }, { w: 360, h: 420 });
      ids.idea = await spawnWindow(pat.page, 'idea', {}, { x: 820, y: 60 }, { w: 360, h: 420 });
      await windowFrame(pat.page, ids.chat).waitFor({ state: 'visible', timeout: 15_000 });
      await pat.page.evaluate((list) => {
        const s = window.__e2eStore.getState();
        s.setSelectedIds(list);
        s.setActiveId(list[0]);
      }, [ids.chat, ids.todos, ids.idea]);
      await press(pat.page, 'Control+1');
      let used = 'Ctrl+1';
      let s = await waitUntil(pat.page, (x) => x.groups.length === 1, 3_000);
      if (!s) {
        used = 'Alt+1 (Ctrl+1 did nothing)';
        await press(pat.page, 'Alt+1');
        s = await waitUntil(pat.page, (x) => x.groups.length === 1, 3_000);
      }
      if (!s) throw new Error('neither Ctrl+1 nor Alt+1 made a group from the three selected windows');
      gid = s.groups[0].id;
      const loose = s.wins.filter((w) => Object.values(ids).includes(w.id) && w.groupId !== gid);
      if (loose.length) throw new Error(`${loose.length} of the three windows are not in the group`);
      const saved = await pat.page.evaluate(() => localStorage.getItem('homebase.group-hotkeys.v1') || '');
      if (!saved.includes(gid)) throw new Error('the group was made but not saved on slot 1');
      grouped = Object.fromEntries(s.wins.map((w) => [w.id, w]));
      // The F1 chip sits on the group's label, or on its own while the label is hidden.
      await pat.page.locator(`[data-group-id="${gid}"]`).getByText('F1', { exact: true }).first().waitFor({ state: 'attached', timeout: 5_000 });
      await shot(pat.page, 'pat-groups-three-windows');
      return `${used} made one group of three windows and saved it on slot 1`;
    });

    await check('walk', 'F1 opens the group full screen and Escape leaves it', async ({ shot }) => {
      const before = (await state(pat.page)).view;
      await press(pat.page, 'F1');
      if (!(await waitUntil(pat.page, (s) => s.focus === gid, 3_000))) throw new Error('F1 did not open the group');
      await shot(pat.page, 'pat-f1-full-screen');
      const how = await leaveFullScreen(pat.page);
      const after = await state(pat.page);
      if (!sameView(before, after.view)) throw new Error(`left full screen but the board did not go back to where it was (zoom ${after.view.zoom})`);
      await shot(pat.page, 'pat-back-on-the-board');
      return how === 'Escape' ? 'F1 opened it, Escape went back to the board as it was' : `only ${how} left it`;
    });

    await check('walk', 'clicking the chat inside the full-screen group keeps its grouped size and place', async ({ shot }) => {
      await press(pat.page, 'F1');
      if (!(await waitUntil(pat.page, (s) => s.focus === gid, 3_000))) throw new Error('F1 did not open the group');
      const frame = windowFrame(pat.page, ids.chat);
      const box = await frame.boundingBox();
      // Click into the chat's message box, the natural way to start typing there.
      await frame.getByPlaceholder(/^Message /).first().click();
      await pat.page.waitForTimeout(800);
      const boxAfter = await frame.boundingBox();
      await shot(pat.page, 'pat-clicks-the-chat-in-full-screen');
      const chat = await readWindow(pat.page, ids.chat);
      await leaveFullScreen(pat.page);
      if (!sameRect(chat, grouped[ids.chat])) throw new Error(`the chat moved or changed size: was ${rect(grouped[ids.chat])}, now ${rect(chat)}`);
      if (!sameRect(box ? { x: box.x, y: box.y, w: box.width, h: box.height } : null, boxAfter ? { x: boxAfter.x, y: boxAfter.y, w: boxAfter.width, h: boxAfter.height } : null)) {
        throw new Error('the chat jumped on screen when clicked');
      }
      if (chat.groupId !== gid) throw new Error('clicking the chat took it out of the group');
      return `the chat stayed at ${rect(chat)} in the group`;
    });

    await check('walk', 'Pat picks the common layout "Side by side" for the group', async ({ shot }) => {
      // The group sits at the top of the screen, under the toolbar (see the bug hunt), so
      // Pat scrolls the board down a little first, as a person would.
      await pat.page.evaluate(() => window.__e2eStore.getState().setPan({ x: 0, y: 120 }));
      await pat.page.waitForTimeout(300);
      // The group's label (with its Layouts button) shows while the pointer is over the group.
      const label = pat.page.locator(`[data-group-id="${gid}"] [data-group-label]`).first();
      await label.hover();
      await label.getByRole('button', { name: 'Layout presets' }).click({ timeout: 10_000 });
      await pat.page.getByRole('button', { name: /Side by side/ }).first().click();
      await pat.page.waitForTimeout(800);
      const s = await state(pat.page);
      const mine = s.wins.filter((w) => Object.values(ids).includes(w.id));
      if (mine.some((w) => w.groupId !== gid)) throw new Error('a window left the group when the layout was picked');
      const pairs = mine.flatMap((a, i) => mine.slice(i + 1).map((b) => [a, b]));
      if (pairs.some(([a, b]) => overlap(a, b))) throw new Error(`windows overlap after the layout: ${mine.map(rect).join(' | ')}`);
      grouped = Object.fromEntries(s.wins.map((w) => [w.id, w]));
      await shot(pat.page, 'pat-side-by-side-layout');
      return `three windows side by side: ${mine.map(rect).join(' | ')}`;
    });

    await check('walk', 'Sam sees the same group with the same layout within 5 seconds', async ({ shot }) => {
      const same = (s) => s.groups.some((g) => g.id === gid)
        && Object.values(ids).every((id) => sameRect(s.wins.find((w) => w.id === id), grouped[id]) && s.wins.find((w) => w.id === id)?.groupId === gid);
      if (!(await waitUntil(sam.page, same, 5_000))) {
        const s = await state(sam.page);
        throw new Error(`Sam's board shows ${s.groups.length} group(s); chat at ${rect(s.wins.find((w) => w.id === ids.chat))}`);
      }
      await shot(sam.page, 'sam-sees-the-group');
      return 'Sam sees the group and its three windows in the same places';
    });

    // The chat's place inside its group: its offset from the group's corner and its size.
    const inGroup = (s) => {
      const g = s.groups.find((x) => x.id === gid);
      const w = s.wins.find((x) => x.id === ids.chat);
      return g && w && w.groupId === gid ? { x: w.x - g.x, y: w.y - g.y, w: w.w, h: w.h } : null;
    };

    await check('walk', 'on the normal board the chat keeps its grouped size through click, header, typing, drag, reload and keys', async ({ shot }) => {
      const want = inGroup(await state(pat.page));
      if (!want) throw new Error('the chat is not in the group before the steps start');
      const kept = async (step) => {
        await pat.page.waitForTimeout(600);
        const now = inGroup(await state(pat.page));
        if (!sameRect(now, want)) throw new Error(`after ${step} the chat ${now ? `is at ${rect(now)}` : 'left the group'}; it was ${rect(want)} in the group`);
      };
      const frame = windowFrame(pat.page, ids.chat);
      const doing = async (step, act) => {
        try { await act(); } catch (err) { throw new Error(`could not do ${step}: ${String(err.message).split('\n')[0]}`, { cause: err }); }
      };
      await doing('a click inside the chat', () => frame.click({ position: { x: 40, y: 120 }, timeout: 8_000 }));
      await kept('a click inside it');
      await doing('a click on the header', () => clickHeader(pat.page, frame));
      await kept('a click on its header');
      await doing('a click in the message box', () => frame.getByPlaceholder(/^Message /).first().click({ timeout: 8_000 }));
      await pat.page.keyboard.type('Made-up note', { delay: 10 });
      await kept('typing in it');
      await shot(pat.page, 'pat-clicks-and-types-in-the-grouped-chat');
      const label = pat.page.locator(`[data-group-id="${gid}"] [data-group-label]`).first();
      await label.hover();
      const r = await label.boundingBox();
      const from = (await state(pat.page)).groups.find((g) => g.id === gid);
      await pat.page.mouse.move(r.x + 12, r.y + r.height / 2);
      await pat.page.mouse.down();
      await pat.page.mouse.move(r.x + 72, r.y + r.height / 2 + 40, { steps: 6 });
      await pat.page.mouse.up();
      const to = (await state(pat.page)).groups.find((g) => g.id === gid);
      if (Math.abs(to.x - from.x) < 20 && Math.abs(to.y - from.y) < 20) throw new Error('dragging the group label did not move the group');
      await kept('dragging the whole group');
      await openBoard(pat.page, t.workspaceId, t.web);
      await windowFrame(pat.page, ids.chat).waitFor({ state: 'visible', timeout: 15_000 });
      await kept('a reload');
      await shot(pat.page, 'pat-grouped-chat-after-reload');
      await press(pat.page, 'Alt+1');
      await kept('Alt+1');
      await press(pat.page, 'F1');
      await waitUntil(pat.page, (s) => s.focus === gid, 3_000);
      await kept('F1');
      await leaveFullScreen(pat.page);
      await kept('Escape');
      grouped = Object.fromEntries((await state(pat.page)).wins.map((w) => [w.id, w]));
      return `the chat stayed ${rect(want)} inside the group after all ten steps`;
    });

    await check('walk', "Sam clicking the same chat does not change Pat's screen", async ({ shot }) => {
      const before = await state(pat.page);
      const want = inGroup(before);
      await windowFrame(sam.page, ids.chat).waitFor({ state: 'visible', timeout: 10_000 });
      await windowFrame(sam.page, ids.chat).click({ position: { x: 40, y: 120 } });
      await clickHeader(sam.page, windowFrame(sam.page, ids.chat));
      await pat.page.waitForTimeout(1_500);
      const after = await state(pat.page);
      await shot(pat.page, 'pat-screen-after-sam-clicks');
      if (!sameRect(inGroup(after), want)) throw new Error(`Pat's chat changed to ${rect(inGroup(after))} when Sam clicked it`);
      if (!sameView(before.view, after.view) || after.focus !== before.focus) throw new Error("Sam's click moved Pat's board");
      return "Pat's chat and board stayed exactly as they were";
    });

    await check('hunt', 'a group at the top of the screen keeps its label clickable', async ({ shot }) => {
      await pat.page.evaluate(() => window.__e2eStore.getState().setPan({ x: 0, y: 0 }));
      const label = pat.page.locator(`[data-group-id="${gid}"] [data-group-label]`).first();
      const r = await label.boundingBox();
      await pat.page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
      await pat.page.waitForTimeout(600);
      const covered = await label.evaluate((el) => {
        const box = el.getBoundingClientRect();
        const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
        return hit && !el.contains(hit) ? (hit.closest('button')?.getAttribute('title') || hit.tagName) : '';
      });
      await shot(pat.page, 'pat-points-at-the-group-label');
      if (covered) throw new Error(`the toolbar covers the group's label and its Layouts button (the pointer lands on "${covered}")`);
      return 'the label takes the click';
    });

    await check('hunt', 'F2 to F9 with no saved group do nothing and break nothing', async () => {
      const before = await state(pat.page);
      await pat.page.evaluate(() => { window.__teamStillHere = true; });
      // F5 is the browser's reload key, so it is left out.
      for (const key of ['F2', 'F3', 'F4', 'F6', 'F7', 'F8', 'F9']) await press(pat.page, key);
      await pat.page.waitForTimeout(500);
      const after = await state(pat.page);
      if (!(await pat.page.evaluate(() => window.__teamStillHere === true))) throw new Error('the page reloaded');
      if (after.focus) throw new Error('an F-key with no group opened a full-screen view');
      if (!sameView(before.view, after.view)) throw new Error('an F-key with no group moved the board');
      return 'nothing happened, as it should';
    });

    await check('hunt', 'Escape twice after F1 lands back on the board as it was', async () => {
      const before = (await state(pat.page)).view;
      await press(pat.page, 'F1');
      if (!(await waitUntil(pat.page, (s) => s.focus === gid, 3_000))) throw new Error('F1 did not open the group');
      await press(pat.page, 'Escape');
      await press(pat.page, 'Escape');
      const after = await waitUntil(pat.page, (s) => !s.focus, 2_000);
      if (!after) {
        await pat.page.keyboard.press('Shift+Escape');
        throw new Error('two presses of Escape did not leave the full-screen group');
      }
      if (!sameView(before, after.view)) throw new Error('the second Escape moved the board away from where it was');
      return 'the first Escape left, the second did nothing';
    });

    await check('hunt', 'taking one window out of the group leaves the other two grouped', async ({ shot }) => {
      const g = (await state(pat.page)).groups.find((x) => x.id === gid);
      const undocked = await pat.page.evaluate((id) => window.__e2eStore.getState().undockWindow(id), ids.idea);
      await updateWindow(pat.page, ids.idea, { groupId: null, x: g.x + g.w + 200, y: g.y });
      const s = await waitUntil(pat.page, (x) => x.wins.find((w) => w.id === ids.idea)?.groupId === null, 3_000);
      if (!s) throw new Error('the idea board stayed in the group');
      const left = [ids.chat, ids.todos].filter((id) => s.wins.find((w) => w.id === id)?.groupId === gid);
      if (left.length !== 2) throw new Error(`only ${left.length} of the other two windows are still grouped`);
      await press(pat.page, 'F1');
      if (!(await waitUntil(pat.page, (x) => x.focus === gid, 3_000))) throw new Error('F1 stopped working after one window left the group');
      await pat.page.waitForTimeout(500);
      const ideaShows = await windowFrame(pat.page, ids.idea).isVisible().catch(() => false);
      await shot(pat.page, 'pat-f1-after-one-window-left');
      await leaveFullScreen(pat.page);
      if (ideaShows) throw new Error('the window that left the group still shows in the group\'s full screen');
      return `${undocked ? 'the tile came out' : 'the window came out'}; the group keeps two and F1 still works`;
    });

    await check('redteam', 'a group named with script text stays plain text on Sam\'s board', async ({ shot }) => {
      const label = '<img src=x onerror="window.__teamPwned=1">Made-up group';
      await pat.page.evaluate(([id, l]) => window.__e2eStore.getState().onUpdateGroup(id, { label: l }), [gid, label]);
      const seen = await waitUntil(sam.page, (s) => s.groups.find((g) => g.id === gid)?.label === label, 5_000);
      if (!seen) throw note('the new group name did not reach Sam within 5 seconds');
      await sam.page.waitForTimeout(500);
      const ran = await sam.page.evaluate(() => window.__teamPwned === 1);
      await shot(sam.page, 'sam-sees-script-text-group-name');
      if (ran) throw new Error('the group name ran as code in Sam\'s browser');
      return 'shown as text; nothing ran';
    });
  },
};
