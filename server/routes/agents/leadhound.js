import express from 'express';
import { requireDb } from './shared.js';
import { agentRouteError, resolveAgentRouteScope } from './scope.js';
import { callModel, createModelAccessContext, workspaceUsageSink } from '../../aiGateway/index.js';
import { createTavilyClient, resolveTavilyKey } from '../../leadhound/tavily.js';
import { runLeadHound } from '../../leadhound/pipeline.js';
import { saveLead } from '../../salesLeads/store.js';

export const leadHoundRouter = express.Router();

// Model calls go through the gateway with a verified access context, so a
// user's own BYOK model key (or the governed free tier) pays for them.
export function createCompleter(scope) {
  const source = 'leadhound';
  const accessContext = createModelAccessContext({ userId: scope.userId, workspaceId: scope.workspaceId, source });
  return async (messages, { maxTokens = 1200, temperature = 0.4 } = {}) => {
    const data = await callModel({
      accessContext,
      body: { messages, max_tokens: maxTokens, temperature },
      timeoutMs: 90000,
      logContext: { source },
      usageAttribution: { workspaceId: scope.workspaceId, actor: { kind: 'user', id: scope.userId }, source },
      usageSink: workspaceUsageSink,
    });
    return data?.choices?.[0]?.message?.content || '';
  };
}

// Which Tavily key LeadHound would use. Never returns the key itself.
leadHoundRouter.get('/leadhound/status', async (req, res) => {
  try {
    const { source } = await resolveTavilyKey(req.session?.userId);
    res.json({ tavily: { configured: Boolean(source), source } });
  } catch (err) {
    agentRouteError(res, err);
  }
});

// One hunt: brief in, scored leads + 7-day sequences + ice breakers out.
leadHoundRouter.post('/leadhound/run', requireDb, async (req, res) => {
  try {
    const scope = await resolveAgentRouteScope(req);
    const { apiKey } = await resolveTavilyKey(scope.userId);
    const tavily = createTavilyClient(apiKey);
    const result = await runLeadHound(req.body || {}, { tavily, complete: createCompleter(scope) });
    res.json({ ok: true, ...result });
  } catch (err) {
    agentRouteError(res, err);
  }
});

// Bank one hunted lead in the shared Lead Queue.
leadHoundRouter.post('/leadhound/save', requireDb, async (req, res) => {
  try {
    const scope = await resolveAgentRouteScope(req);
    const lead = req.body?.lead || {};
    const contacts = lead.contacts || {};
    const saved = await saveLead({
      name: lead.company,
      website: lead.url,
      email: contacts.emails?.[0] || null,
      phone: contacts.phones?.[0] || null,
      facebook: contacts.facebook,
      instagram: contacts.instagram,
      linkedin: contacts.linkedin,
      buying_signals: (lead.pain_points || []).slice(0, 4),
      icp_score: (Number(lead.fitScore) || 0) / 100,
      source_url: lead.url,
      notes: [lead.why_fit, lead.angle && `Angle: ${lead.angle}`, 'Found by LeadHound'].filter(Boolean).join('\n'),
    }, scope);
    res.json({ ok: true, ...saved });
  } catch (err) {
    agentRouteError(res, err);
  }
});
