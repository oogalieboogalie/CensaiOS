// Hosted agents (Agent Designer → Import → Hosted agent). Owner only.
//   GET  /api/agent-import/hosted/vendors              → the vendors and what each needs
//   POST /api/agent-import/hosted/test   {vendor, ref, endpoint}   → {ok, name, description}
//   POST /api/agent-import/hosted/import {vendor, ref, endpoint, name?, hue?} → the new board agent
//   POST /api/agent-import/hosted/elevenlabs/create {name, voiceId, firstMessage, instructions, hue?}
//     → makes the agent on ElevenLabs with the person's own key, then imports it
// Keys come from the person's own vault and never leave the server here.

import express from 'express';
import pool from '../db.js';
import { createLogger } from '../logger.js';
import { requireSystemAdmin } from '../security/systemAdmin.js';
import { netFetch } from '../security/publicAddress.js';
import { getUserApiKeyConfig } from '../security/userApiKeys.js';
import { upsertAgent } from '../memory.js';
import { canonicalAgentId } from './agents/canonicalMutation.js';
import { HostedAgentError } from '../hostedAgents/http.js';
import { keyFor } from '../hostedAgents/runTurn.js';
import { saveHostedAgent } from '../hostedAgents/store.js';
import { getVendor, publicVendors } from '../hostedAgents/vendors/index.js';

const log = createLogger('hosted-agents');

function slugify(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 56);
}

async function freeAgentId(db, name) {
  const base = slugify(name) || 'hosted-agent';
  const { rows } = await db.query('SELECT id FROM agents WHERE id = $1 OR id LIKE $2', [base, `${base}-%`]);
  const taken = new Set(rows.map((row) => row.id));
  let id = base;
  for (let n = 2; taken.has(id) || canonicalAgentId(id); n += 1) id = `${base}-${n}`;
  return id;
}

function cleanText(value, max) {
  return String(value ?? '').split('\u0000').join('').trim().slice(0, max);
}

/** The board agent for a hosted one: it shows like any agent, with its vendor on the badge. */
export function hostedAgentPayload({ id, vendor, found, name, hue }) {
  const shownName = cleanText(name || found.name, 80) || `${vendor.label} agent`;
  return {
    id,
    name: shownName,
    role: cleanText(found.description, 120) || `Hosted on ${vendor.label}`,
    glyph: (shownName[0] || 'H').toUpperCase(),
    kind: 'ai',
    hue: Number.isFinite(Number(hue)) ? Math.abs(Math.round(Number(hue))) % 360 : 222,
    personality: cleanText(found.description, 2000) || null,
    specialty: `Hosted on ${vendor.label}`,
    system_prompt: cleanText(found.instructions, 20_000) || null,
    model_provider: 'hosted',
    model_name: vendor.id,
    toolScopes: {
      mode: 'custom',
      tools: [],
      scopes: { github: { repos: [] }, local: { paths: [] }, project: { mode: 'current' } },
      hosted: { vendor: vendor.id, label: vendor.label, billedBy: vendor.billedBy },
      imported: { platform: `hosted:${vendor.id}`, carried: ['Name', 'Conversation memory (kept by the vendor)'], notCarried: [], at: new Date().toISOString() },
    },
  };
}

export function createHostedAgentsRouter(deps = {}) {
  const router = express.Router();
  const db = deps.db || pool;
  const vault = deps.getUserApiKeyConfig || getUserApiKeyConfig;
  const fetchImpl = deps.fetchImpl || netFetch;
  const saveAgent = deps.upsertAgent || upsertAgent;
  router.use(deps.ownerGate || requireSystemAdmin);
  router.use(express.json({ limit: '64kb' }));

  const prepare = async (req) => {
    const vendor = getVendor(String(req.body?.vendor || '').toLowerCase());
    if (!vendor) throw new HostedAgentError('Pick Claude, OpenAI, Google, ElevenLabs or LangChain.', 400, 'HOSTED_AGENT_UNKNOWN_VENDOR');
    const target = vendor.normalize({ ref: req.body?.ref, endpoint: req.body?.endpoint });
    const apiKey = await keyFor(vendor, req.session.userId, { vault });
    return { vendor, target, apiKey };
  };

  const fail = (res, err, what) => {
    const status = err instanceof HostedAgentError ? err.statusCode : 500;
    if (status >= 500) log.error(`${what} failed`, { error: err?.message });
    else log.warn(`${what} refused`, { code: err?.code || null, error: err?.message });
    return res.status(status).json({ error: status === 500 ? 'Something went wrong on this computer. See the app log (hosted-agents).' : err.message, code: err?.code || null });
  };

  const importFound = async (req, { vendor, target, found }) => {
    const id = await freeAgentId(db, req.body?.name || found.name);
    const agent = await saveAgent(hostedAgentPayload({ id, vendor, found, name: req.body?.name, hue: req.body?.hue }));
    try {
      await saveHostedAgent(db, { agentId: id, vendor: vendor.id, ref: target.ref, endpoint: target.endpoint, settings: target.settings, userId: req.session.userId });
    } catch (err) {
      // Never leave a board agent that looks hosted but has nowhere to send its messages.
      await db.query('DELETE FROM agents WHERE id = $1', [id]).catch(() => {});
      throw err;
    }
    log.info('hosted agent imported', { agentId: id, vendor: vendor.id });
    return agent;
  };

  router.get('/vendors', (_req, res) => res.json({ vendors: publicVendors() }));

  router.post('/test', async (req, res) => {
    try {
      const { vendor, target, apiKey } = await prepare(req);
      const found = await vendor.describe({ ...target, apiKey, fetchImpl });
      log.info('hosted agent connection tested', { vendor: vendor.id, ok: true });
      return res.json({ ok: true, vendor: vendor.id, name: found.name || null, description: found.description || null });
    } catch (err) {
      return fail(res, err, 'connection test');
    }
  });

  router.post('/import', async (req, res) => {
    try {
      const { vendor, target, apiKey } = await prepare(req);
      const found = await vendor.describe({ ...target, apiKey, fetchImpl });
      return res.json({ agent: await importFound(req, { vendor, target, found }) });
    } catch (err) {
      return fail(res, err, 'import');
    }
  });

  router.post('/elevenlabs/create', async (req, res) => {
    try {
      const vendor = getVendor('elevenlabs');
      const apiKey = await keyFor(vendor, req.session.userId, { vault });
      const draft = {
        name: cleanText(req.body?.name, 80),
        voiceId: cleanText(req.body?.voiceId, 80),
        firstMessage: cleanText(req.body?.firstMessage, 1000),
        instructions: cleanText(req.body?.instructions, 20_000),
      };
      if (!draft.name || !draft.instructions) throw new HostedAgentError('Give the agent a name and instructions.', 400, 'HOSTED_AGENT_DRAFT_INCOMPLETE');
      const made = await vendor.create({ ...draft, apiKey, fetchImpl });
      log.info('elevenlabs agent created', { vendor: 'elevenlabs' });
      const target = vendor.normalize({ ref: made.ref });
      const found = { name: draft.name, description: 'Voice agent made in censaiOS', instructions: draft.instructions };
      return res.json({ agent: await importFound(req, { vendor, target, found }), ref: made.ref });
    } catch (err) {
      return fail(res, err, 'elevenlabs create');
    }
  });

  return router;
}

export const hostedAgentsRouter = createHostedAgentsRouter();
