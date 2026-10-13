import { createLogger } from '../logger.js';
import { CapabilityDeniedError, requireCapability } from '../capabilities/checkCapability.js';
import { buildPromotionPlan, writePromotion } from '../window-import/promoteModule.js';
import { runWindowSync } from '../window-import/windowPackageWriter.js';

const log = createLogger('module-promote');

/**
 * POST /api/modules/promote
 * Body: { kind?, label?, hint?, manifest, source, request?, libraryId?, listingId?, dryRun? }
 *
 * Spec 6 "promote to built-in": turn a module built on the canvas into a
 * folder window, its stylesheet and an @import line, then run window:sync so
 * it shows in the Add menu. A dry run returns the files it would write.
 * Anyone may preview; only admins (the owner of this censaiOS) may write,
 * and only where censaiOS runs from its own folder (mounted behind
 * requireLocalFilesystem). Unlike the LLM window importer, nothing written
 * here runs outside the module sandbox: the files are fixed templates and
 * the module's code is stored as a string.
 */
export async function promoteModuleHandler(req, res) {
  const dryRun = req.body?.dry_run === true || req.body?.dryRun === true;
  try {
    requireCapability(dryRun ? 'window.import.validate' : 'window.import.write', req.session || {});
  } catch (err) {
    if (err instanceof CapabilityDeniedError) {
      return res.status(err.statusCode || 403).json({ ok: false, code: err.code || 'CAPABILITY_DENIED', error: 'Only the owner of this censaiOS can add built-in windows.' });
    }
    throw err;
  }

  let plan;
  try {
    const { WINDOW_MANIFESTS } = await import('../../src/lib/windowManifest.js');
    plan = buildPromotionPlan({
      kind: typeof req.body?.kind === 'string' && req.body.kind.trim() ? req.body.kind.trim() : null,
      label: typeof req.body?.label === 'string' ? req.body.label : '',
      hint: typeof req.body?.hint === 'string' ? req.body.hint : '',
      manifest: req.body?.manifest,
      source: typeof req.body?.source === 'string' ? req.body.source : '',
      request: typeof req.body?.request === 'string' ? req.body.request : '',
      libraryId: req.body?.libraryId || null,
      listingId: req.body?.listingId || null,
    }, { existingKinds: WINDOW_MANIFESTS.map(m => m.kind) });
  } catch (err) {
    return res.status(err.statusCode || 400).json({ ok: false, code: err.code || 'PROMOTE_FAILED', error: err.message });
  }

  const summary = { kind: plan.kind, label: plan.label, componentName: plan.componentName, files: plan.relativeFiles };
  if (dryRun) return res.json({ ok: true, dryRun: true, ...summary });

  try {
    writePromotion(plan);
    const syncResult = await runWindowSync();
    log.info('module promoted to a built-in window', { kind: plan.kind, syncOk: syncResult.ok });
    res.json({ ok: true, ...summary, syncOk: syncResult.ok, syncOutput: syncResult.output });
  } catch (err) {
    log.error('module promotion failed', { error: err.message });
    res.status(500).json({ ok: false, code: 'PROMOTE_FAILED', error: 'The window files could not be written.' });
  }
}
