// One YorWare CAD window: the recipe and sizes on the board, my unsaved
// edits to the recipe, and building the part whenever either changes.
import React from 'react';
import { codePatch, paramPatch, readCad, recipeHash, resetPatch, runPatch } from '../../../lib/yorware/cadModel.js';
import { CAD_RECIPES, recipeById } from '../../../lib/yorware/cadRecipes.js';
import { getSelf } from '../../../lib/modules/presenceRoster.js';
import { cadAvailable, cadJob } from './cadClient.js';

export const UNTITLED = 'Untitled part';
const SETTLE_MS = 120;

export function useCad(win, onUpdate) {
  const board = React.useMemo(() => readCad(win), [win]);
  const canEdit = getSelf().canEdit !== false;
  const [draft, setDraft] = React.useState(null);
  const [part, setPart] = React.useState(null);
  const [status, setStatus] = React.useState('idle');
  const [notice, setNotice] = React.useState(null);
  const update = React.useRef(onUpdate);
  update.current = onUpdate;
  const boardRef = React.useRef(board);
  boardRef.current = board;

  const valuesKey = JSON.stringify(board.values);
  const wanted = React.useRef(null);
  const busy = React.useRef(false);

  const runNext = React.useCallback(async () => {
    if (busy.current || !wanted.current) return;
    const job = wanted.current;
    wanted.current = null;
    busy.current = true;
    setStatus('building');
    let result;
    try {
      result = await cadJob({ type: 'build', code: job.code, overrides: job.values });
    } catch (err) {
      result = { ok: false, error: err?.message || String(err), specs: [] };
    }
    busy.current = false;
    if (wanted.current) { runNext(); return; }
    result.code = job.code;
    setPart((old) => (result.ok ? result : { ...result, meshes: old?.meshes, bounds: old?.bounds, stale: true, specs: result.specs?.length ? result.specs : old?.specs || [] }));
    setStatus(result.ok ? 'ok' : 'error');
    // Tell the board how the build went, once per recipe and sizes.
    const patch = canEdit && job.code === boardRef.current.code ? runPatch(boardRef.current, result, job.hash) : null;
    if (patch) update.current?.(patch);
  }, [canEdit]);

  React.useEffect(() => {
    if (!board.code.trim()) { setPart(null); setStatus('idle'); return undefined; }
    if (!cadAvailable()) { setStatus('error'); setPart({ ok: false, error: 'This browser cannot run the CAD kernel (no Web Workers).', specs: [] }); return undefined; }
    const values = JSON.parse(valuesKey);
    const t = setTimeout(() => {
      wanted.current = { code: board.code, values, hash: recipeHash(board.code, values) };
      runNext();
    }, SETTLE_MS);
    return () => clearTimeout(t);
  }, [board.code, valuesKey, runNext]);

  const save = (patch) => { if (canEdit) update.current?.(patch); };

  const setValue = (name, value) => save(paramPatch(name, value));
  const resetValues = () => save(resetPatch(board.values));

  /** Put my edited recipe on the board (and build it). */
  const runDraft = () => {
    if (draft === null) return;
    try {
      save(codePatch(draft));
      setDraft(null);
    } catch (err) {
      setNotice(err.message);
    }
  };

  // A ready-made part names the window, unless someone already named it.
  const startFrom = (id) => {
    const recipe = recipeById(id);
    if (!recipe) return;
    const named = win.title && win.title !== UNTITLED && !CAD_RECIPES.some((r) => r.label === win.title);
    const title = named || recipe.id === 'blank' ? null : recipe.label;
    save({ ...codePatch(recipe.code), ...resetPatch(board.values), ...(title ? { title } : {}) });
  };

  const exportAs = async (format) => {
    const out = await cadJob({ type: 'export', format, code: board.code, overrides: board.values });
    if (!out.ok) throw new Error(out.error);
    return out.bytes;
  };

  return {
    board, canEdit, part, status, notice, setNotice,
    code: draft ?? board.code, dirty: draft !== null && draft !== board.code,
    setDraft, discardDraft: () => setDraft(null), runDraft,
    setValue, resetValues, startFrom, exportAs,
  };
}
