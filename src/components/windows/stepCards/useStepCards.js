import React from 'react';
import { logToApp } from '../../../lib/appLog/browserLog.js';
import { newId } from '../../../lib/ids/newId.js';
import { useWorkspaceStore } from '../../../lib/store.js';
import { parseTodoFile, writeTodoFile } from '../../../lib/stepCards/todoFile.js';
import { applyResults, makeCard, markChecking, normalizeCards, topStep } from '../../../lib/stepCards/stack.js';
import { cliAgentsApi } from '../../agentConsole/cliAgentsApi.js';
import { STEPS_OFF_BOARD } from '../../../../shared/files/fileProblems.js';
import { readTodoFile, stepCardsApi } from './stepCardsApi.js';
import { sendStep } from './dispatch.js';

const log = (level, message) => logToApp(level, `step-cards: ${message}`, { where: 'step-cards' });
const POLL_MS = 8000;

// The Step cards window's state lives on the window (win.cards), so it is saved
// with the board and survives a reload. latest keeps async work from writing
// over a change made while it was waiting.
export function useStepCards({ win, onUpdate, currentProject }) {
  const workspaceId = useWorkspaceStore((s) => s.workspaceId);
  const cards = React.useMemo(() => normalizeCards(win.cards), [win.cards]);
  const latest = React.useRef(cards);
  latest.current = cards;
  const [busy, setBusy] = React.useState(null);
  const [error, setError] = React.useState(null);
  const [note, setNote] = React.useState(null);
  const selectedId = cards.some((c) => c.id === win.selectedCardId) ? win.selectedCardId : cards[0]?.id || null;
  const selected = cards.find((c) => c.id === selectedId) || null;
  const folder = currentProject?.path || null;

  const save = React.useCallback((next, extra = {}) => {
    latest.current = next;
    onUpdate({ cards: next, ...extra });
  }, [onUpdate]);
  const patchCard = React.useCallback((id, fn) => {
    save(latest.current.map((c) => (c.id === id ? fn(c) : c)));
  }, [save]);
  const patchStep = (cardId, stepId, patch) => patchCard(cardId, (c) => ({ ...c, steps: c.steps.map((s) => (s.id === stepId ? { ...s, ...patch } : s)) }));

  const addCards = React.useCallback((raws, how, fromFile = null) => {
    const made = raws.map((raw) => makeCard(raw, newId)).filter((c) => c.steps.length).map((c) => (fromFile ? { ...c, fromFile } : c));
    if (!made.length) throw new Error('No steps with checks were found in that.');
    save([...latest.current, ...made], { selectedCardId: made[0].id });
    log('info', `${how}: ${made.length} card(s), ${made.reduce((n, c) => n + c.steps.length, 0)} steps`);
    return made;
  }, [save]);

  const run = async (what, fn) => {
    setBusy(what);
    setError(null);
    try {
      return await fn();
    } catch (err) {
      setError(err.message || 'Something went wrong.');
      log('warn', `${what} failed (${err.status || 'no status'})`);
      return null;
    } finally {
      setBusy(null);
    }
  };

  const translate = (text) => run('translating', async () => {
    const out = await stepCardsApi.translate(text);
    addCards(out.cards, out.translated ? 'Censai turned a card into steps' : 'read a pasted .todo card');
    setNote(out.skipped ? `${out.skipped} check(s) were left out because censaiOS cannot check them.` : null);
    return true;
  });

  const importText = (text, how = 'imported a .todo file', fromFile = null) => run('importing', async () => {
    // Every screen showing the window may read its file before any has marked it read: its cards come in once.
    if (fromFile && latest.current.some((c) => c.fromFile === fromFile)) return true;
    const parsed = parseTodoFile(text);
    if (!parsed.cards.length) throw new Error('That file has no cards with steps in it.');
    addCards(parsed.cards, how, fromFile);
    if (parsed.title && !win.title) onUpdate({ title: parsed.title });
    setNote(parsed.skipped ? `${parsed.skipped} check(s) were left out because censaiOS cannot check them.` : null);
    return true;
  });

  // Opened from the Files window: read the .todo file once (the ref also covers a second effect run).
  // A file only the owner opens is marked on the window, with none of its words,
  // so every screen says why it has no cards, after a reload too.
  const loading = React.useRef(null);
  React.useEffect(() => {
    if (!win.filePath || win.loadedFrom === win.filePath || loading.current === win.filePath) return;
    loading.current = win.filePath;
    onUpdate({ loadedFrom: win.filePath });
    readTodoFile(win).then((text) => importText(text, 'opened a .todo file', win.filePath)).catch((err) => {
      if (err.offBoard) onUpdate({ offBoardFile: win.filePath });
      else setError(err.message);
    });
  }, [win.filePath]);

  const check = React.useCallback(async (card, step, { automatic = false } = {}) => {
    const open = step.checks.filter((c) => c.state !== 'passed');
    patchCard(card.id, (c) => markChecking(c, step.id, open.map((c2) => c2.id)));
    setError(null);
    try {
      const out = await stepCardsApi.check({ folder, cliTaskId: card.cliTaskId || null, automatic, report: step.report || '', step: { title: step.title, text: step.text }, checks: open });
      patchCard(card.id, (c) => applyResults(c, step.id, out.results));
      const green = out.results.filter((r) => r.ok === true).length;
      log('info', `checked a step: ${green} of ${out.results.length} newly green`);
      setNote(out.helperStillWorking ? 'The helper is still working, so some checks may not be true yet.' : null);
    } catch (err) {
      patchCard(card.id, (c) => applyResults(c, step.id, []));
      setError(err.message);
      log('warn', `check failed (${err.status || 'no status'})`);
    }
  }, [folder, patchCard]);

  const send = (card, step) => run('sending', async () => {
    const out = await sendStep({ card, step, folder, workspaceId });
    patchCard(card.id, (c) => ({ ...c, ...out.card, steps: c.steps.map((s) => (s.id === step.id ? { ...s, ...out.step, autoCheckedAt: null } : s)) }));
    log('info', out.log);
    window.dispatchEvent(new Event('tasks-updated'));
    return true;
  });

  // A step sent to a coding agent checks itself once the agent has finished.
  const waiting = selected && topStep(selected);
  const watchTask = waiting?.sentAt && selected.cliTaskId && !waiting.autoCheckedAt ? selected.cliTaskId : null;
  React.useEffect(() => {
    if (!watchTask) return undefined;
    let stopped = false;
    const tick = async () => {
      try {
        const { task } = await cliAgentsApi.task(watchTask, 1e9);
        if (stopped || task?.running) return;
        const card = latest.current.find((c) => c.cliTaskId === watchTask);
        const step = card && topStep(card);
        if (!step || step.autoCheckedAt || step.checks.some((c) => c.state === 'checking')) return;
        patchStep(card.id, step.id, { autoCheckedAt: new Date().toISOString() });
        log('info', 'the coding agent finished, checking the step');
        await check(latest.current.find((c) => c.id === card.id), { ...step, autoCheckedAt: true }, { automatic: true });
      } catch { /* the Agent Console is not here (cloud) or the run is gone: the person checks by hand */ }
    };
    const timer = setInterval(tick, POLL_MS);
    return () => { stopped = true; clearInterval(timer); };
  }, [watchTask, check]);

  const assign = (cardId, value, name) => patchCard(cardId, (c) => ({
    ...c, assignee: value || null, assigneeName: value ? name : null,
    ...(c.assignee !== value ? { cliTaskId: null, cliId: null } : {}),
  }));
  const remove = (cardId) => { save(latest.current.filter((c) => c.id !== cardId)); log('info', 'removed a card'); };
  const select = (cardId) => onUpdate({ selectedCardId: cardId });
  const setReport = (cardId, stepId, report) => patchStep(cardId, stepId, { report: report.slice(0, 6000) });

  const exportText = () => {
    log('info', `saved ${cards.length} card(s) as a .todo file`);
    return writeTodoFile({ title: win.title || 'Step cards', cards });
  };

  return {
    cards, selected, busy, note, folder,
    error: error || (win.filePath && win.offBoardFile === win.filePath ? STEPS_OFF_BOARD : null),
    clearError: () => setError(null),
    translate, importText, check, send, assign, remove, select, setReport, exportText,
  };
}
