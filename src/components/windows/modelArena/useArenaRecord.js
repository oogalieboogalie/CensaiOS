import React from 'react';
import { useWorkspaceStore } from '../../../lib/store.js';
import { benchmarkTaskFor } from '../../../lib/modelArena/benchmarkTasks.js';
import { addRecord, cleanMarks, emptyMarks, makeRecord, updateRecordMarks } from '../../../lib/modelArena/benchmarks.js';
import { judgeRequest, parseJudgeReply } from '../../../lib/modelArena/arenaJudge.js';
import { runArena } from '../../../lib/modelArena/runArena.js';

export const BENCHMARKS_KIND = 'arenaBenchmarks';

const toLane = (id) => {
  const at = id.indexOf(':');
  return { provider: id.slice(0, at), model: id.slice(at + 1) };
};

/** Writes into the board's Benchmarks window, opening one if there is none. */
function writeBenchmarks(change) {
  const store = useWorkspaceStore.getState();
  const board = (store.wins || []).find((w) => w.kind === BENCHMARKS_KIND);
  if (board) store.onUpdate(board.id, { runs: change(board.runs) });
  else store.spawnAt(BENCHMARKS_KIND, { runs: change([]) });
}

/**
 * Marks and recording for the last finished race: which answer was best,
 * which were right or wrong, an optional judge model's pick, and "Record
 * this run", which saves it all to the Benchmarks window on the board.
 * Marks made after recording update the saved record too.
 */
export function useArenaRecord(win = {}, onUpdate, { running }) {
  const lastRun = win.lastRun || null;
  const laneCount = lastRun?.lanes?.length || 0;
  const marks = cleanMarks(lastRun?.marks, laneCount);
  const finished = !running && Boolean(lastRun?.results?.some((r) => r?.status === 'done'));
  const [judging, setJudging] = React.useState(false);
  const [judgeError, setJudgeError] = React.useState('');
  // Only a premade task is ranked; a typed-in request is kept as a note.
  const task = lastRun ? benchmarkTaskFor(win.prompt, win.system) : null;

  const saveMarks = React.useCallback((next) => {
    if (!lastRun) return;
    onUpdate?.({ lastRun: { ...lastRun, marks: next } });
    if (lastRun.recordId) writeBenchmarks((runs) => updateRecordMarks(runs, lastRun.recordId, next));
  }, [lastRun, onUpdate]);

  const pickBest = (index) => saveMarks({ ...marks, best: marks.best === index ? null : index });
  const markLane = (index, value) => {
    const lanes = { ...marks.lanes };
    if (lanes[index] === value) delete lanes[index];
    else lanes[index] = value;
    saveMarks({ ...marks, lanes });
  };

  const record = React.useCallback(() => {
    if (!finished || lastRun.recordId) return;
    const entry = makeRecord({
      prompt: win.prompt, system: win.system, lanes: lastRun.lanes, results: lastRun.results, marks, task: task?.id || null,
    });
    writeBenchmarks((runs) => addRecord(runs, entry));
    onUpdate?.({ lastRun: { ...lastRun, recordId: entry.id } });
  }, [finished, lastRun, marks, task, win.prompt, win.system, onUpdate]);

  const setJudge = (id) => onUpdate?.({ judge: id || '' });

  const askJudge = React.useCallback(async () => {
    if (!win.judge || !finished || judging) return;
    const request = judgeRequest({ prompt: win.prompt, system: win.system, results: lastRun.results, check: task?.check });
    if (request.answerCount < 2) { setJudgeError('The judge needs at least two finished answers.'); return; }
    setJudging(true);
    setJudgeError('');
    let text = '';
    let failure = '';
    try {
      await runArena({
        prompt: request.prompt, system: request.system, models: [toLane(win.judge)], maxTokens: 2048,
        onEvent: (event) => {
          if (event.type === 'delta') text += String(event.text || '');
          if (event.type === 'error') failure = event.error?.message || 'The judge did not answer.';
        },
      });
    } catch (error) {
      failure = error.message || 'The judge did not answer.';
    }
    setJudging(false);
    const verdict = failure ? null : parseJudgeReply(text, laneCount);
    if (!verdict) { setJudgeError(failure || 'The judge answered, but not with a pick. Try another judge model.'); return; }
    saveMarks({ ...marks, judge: { model: win.judge, ...verdict } });
  }, [win.judge, win.prompt, win.system, finished, judging, lastRun, laneCount, marks, task, saveMarks]);

  return {
    marks: lastRun ? marks : emptyMarks(),
    finished,
    task,
    recorded: Boolean(lastRun?.recordId),
    judge: win.judge || '',
    judging,
    judgeError,
    pickBest,
    markLane,
    record,
    setJudge,
    askJudge,
  };
}
