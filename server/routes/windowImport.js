/**
 * Window Import Route
 *
 * POST /api/windows/import
 *   Accepts raw JSX + CSS (e.g. from AI Studio), adapts it via LLM to
 *   match Censai window conventions, writes the folder, and runs
 *   window:sync so it appears on the canvas immediately.
 *
 * POST /api/windows/sync
 *   Just runs window:sync and returns the result (used by UI to refresh).
 */

import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createLogger } from '../logger.js';
import { callModel } from '../aiGateway/callModel.js';
import { validateGeneratedWindow, windowComponentName } from '../window-import/validation.js';
import {
  buildWindowFilePlan,
  normalizeWindowKind,
  parseLlmJsonResponse,
  runWindowSync,
  writeWindowPackage,
} from '../window-import/windowPackageWriter.js';
import { CapabilityDeniedError, requireCapability } from '../capabilities/checkCapability.js';
import { resourceRateLimiter } from '../middleware/standardRateLimits.js';

const log = createLogger('window-import');
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const WINDOWS_DIR = path.join(PROJECT_ROOT, 'src', 'components', 'windows');

export const windowImportRouter = express.Router();
windowImportRouter.use(resourceRateLimiter);

// ── The CensaiHub window conventions prompt ────────────────────────────────

function buildAdaptPrompt(rawJsx, rawCss, hint) {
  return `You are a code transformer. Take raw React code (possibly exported from AI Studio or another tool) and adapt it to fit Censai's window component conventions EXACTLY.

CENSAI WINDOW CONVENTIONS:
1. File is named <Name>Window.jsx — component must be: export function <Name>Window() {}
2. Also add: export default <Name>Window; at the bottom
3. CSS goes in a companion file imported as: import './<Name>Window.css';
4. ONLY use these CSS variables — replace ALL hardcoded colors:
   - var(--surface)  → window background
   - var(--ink)      → primary text  
   - var(--accent)   → brand color (buttons, highlights)
   - var(--accent-soft) → subtle borders/dividers
   - color-mix(in srgb, var(--ink) 50%, transparent) → muted text
5. NO Tailwind. Vanilla CSS only.
6. Remove: main.tsx, App.tsx wrapper, ReactDOM.createRoot, index.html boilerplate
7. Remove: import React from 'react' (modern JSX transform)
8. The window fills height: 100% with internal scrolling — no fixed px heights on the root
9. NO routing (no react-router)
10. API calls use fetch('/api/...') — same origin Express backend

${hint ? `USER HINT: ${hint}` : ''}

RAW JSX TO ADAPT:
\`\`\`jsx
${rawJsx}
\`\`\`

${rawCss ? `RAW CSS TO ADAPT:\n\`\`\`css\n${rawCss}\n\`\`\`` : ''}

Respond with EXACTLY this JSON structure (no markdown, raw JSON only):
{
  "kind": "camelCaseKind",
  "label": "Human Readable Label",
  "jsx": "...complete adapted JSX file content...",
  "css": "...complete adapted CSS file content...",
  "defaultSize": { "w": 520, "h": 480 }
}`;
}

// ── Routes ─────────────────────────────────────────────────────────────────

/**
 * POST /api/windows/import
 * Body: { rawJsx, rawCss?, hint?, kind?, label?, defaultSize?, launcher? }
 *
 * Steps:
 * 1. Call LLM to adapt the raw code
 * 2. Write files to src/components/windows/<kind>/
 * 3. Run window:sync
 * 4. Return { ok, kind, label, syncOutput }
 */
windowImportRouter.post('/import', async (req, res) => {
  const { rawJsx, rawCss = '', hint = '', launcher } = req.body;
  const dryRun = req.body?.dry_run === true || req.body?.dryRun === true;

  if (!rawJsx || rawJsx.trim().length < 20) {
    return res.status(400).json({ error: 'rawJsx is required and must contain actual code.' });
  }

  // P1-2 capability split: dry-run needs window.import.validate (user-OK),
  // real writes need window.import.write (admin-only). Enforce at route-time
  // so P1-1's routeMap refactor stays orthogonal — no mount-time changes.
  try {
    requireCapability(
      dryRun ? 'window.import.validate' : 'window.import.write',
      req.session || {}
    );
  } catch (err) {
    if (err instanceof CapabilityDeniedError) {
      return res.status(err.statusCode || 403).json({
        ok: false,
        code: err.code || 'CAPABILITY_DENIED',
        error: err.message,
      });
    }
    throw err;
  }

  try {
    // ── Step 1: LLM adaptation via AI gateway ─────────────────────────────
    log.info('adapting window code via LLM');
    const prompt = buildAdaptPrompt(rawJsx, rawCss, hint);

    const aiResponse = await callModel({
      body: {
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
      },
      logContext: { route: 'window-import' },
    });

    const rawContent = aiResponse.choices?.[0]?.message?.content || '';

    // Parse JSON from LLM response (strip any accidental markdown fences)
    let adapted;
    try {
      adapted = parseLlmJsonResponse(rawContent);
    } catch {
      log.error('LLM returned non-JSON', { rawContent: rawContent.slice(0, 500) });
      return res.status(502).json({
        error: 'LLM did not return valid JSON. Try again or simplify the input.',
        rawLlmOutput: rawContent.slice(0, 1000),
      });
    }

    const rawKind = adapted.kind || 'importedWindow';
    const label = adapted.label || normalizeWindowKind(rawKind);
    const size = adapted.defaultSize || { w: 520, h: 480 };
    const jsx = adapted.jsx || '';
    const css = adapted.css || '';

    if (!jsx) {
      return res.status(502).json({ error: 'LLM returned empty JSX. Try again.' });
    }

    const filePlan = buildWindowFilePlan({
      kind: rawKind,
      label,
      size,
      jsx,
      css,
      launcher,
    });
    const validation = validateGeneratedWindow({
      kind: filePlan.kind,
      label,
      rawJsx: filePlan.jsx,
      rawCss: css,
    });
    if (!validation.ok) {
      return res.status(422).json({
        error: 'Generated window contains blocked code patterns.',
        ...validation,
      });
    }

    if (dryRun) {
      return res.json({
        ok: true,
        dryRun: true,
        kind: filePlan.kind,
        label,
        componentName: filePlan.componentName,
        defaultSize: size,
        validation,
      });
    }

    // ── Step 2: Write files ────────────────────────────────────────────────
    writeWindowPackage(filePlan);

    log.info('window files written', {
      kind: filePlan.kind,
      componentName: filePlan.componentName,
      dir: filePlan.windowDir,
    });

    // ── Step 3: window:sync ────────────────────────────────────────────────
    const syncResult = await runWindowSync();
    log.info('window:sync result', syncResult);

    res.json({
      ok: true,
      kind: filePlan.kind,
      label,
      componentName: filePlan.componentName,
      syncOk: syncResult.ok,
      syncOutput: syncResult.output,
      message: syncResult.ok
        ? `✓ "${label}" imported and synced as a hidden prototype. Prove it in Window Lab before publishing it to Modules.`
        : `Files written but sync had issues: ${syncResult.output}`,
    });
  } catch (err) {
    log.error('window import failed', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/windows/sync
 * Runs window:sync manually (e.g. after a manual folder drop).
 */
windowImportRouter.post('/sync', async (_req, res) => {
  const result = await runWindowSync();
  res.json(result);
});

/**
 * GET /api/windows/list-importable
 * Returns folder windows that have a meta.js but may not be synced yet.
 */
windowImportRouter.get('/list-importable', (_req, res) => {
  try {
    if (!fs.existsSync(WINDOWS_DIR)) return res.json({ windows: [] });
    const dirs = fs.readdirSync(WINDOWS_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory() && fs.existsSync(path.join(WINDOWS_DIR, d.name, 'meta.js')))
      .map(d => ({ kind: d.name, hasCss: fs.existsSync(path.join(WINDOWS_DIR, d.name, `${windowComponentName(d.name)}.css`)) }));
    res.json({ windows: dirs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
