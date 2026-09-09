import express from 'express';
import {
  callModel,
  createModelAccessContext,
  resolveChatModelConfig,
  workspaceUsageSink,
} from '../aiGateway/index.js';

export const agentIconsRouter = express.Router();

const MAX_PROMPT_CHARS = 500;
const MAX_SVG_CHARS = 20_000;

function iconGenerationEnabled() {
  const raw = String(process.env.CENSAAI_AGENT_ICON_GENERATOR ?? '').trim().toLowerCase();
  return raw === '1' || raw === 'true';
}

function buildSvgPrompt({ prompt, kind }) {
  return [
    'Design a flat vector icon for an AI agent.',
    `Agent kind: ${kind || 'agent'}. Theme: ${prompt}.`,
    'Rules:',
    '- Return ONLY raw <svg> markup with viewBox="0 0 64 64". No explanations, no code fences.',
    '- Use simple shapes (circle, rect, path) with 2-4 flat colors. No gradients, no text, no scripts.',
    '- Keep it recognizable at 16px: bold silhouette, generous whitespace.',
  ].join('\n');
}

export function extractSvgMarkup(text) {
  const match = String(text || '').match(/<svg\b[^>]*>[\s\S]*?<\/svg\s*>/i);
  if (!match) return null;
  const svg = match[0].trim();
  if (svg.length > MAX_SVG_CHARS) return null;
  return svg;
}

/**
 * @route POST /api/agent-icons/generate
 * @param {string} req.body.prompt Free-text icon theme (<=500 chars).
 * @param {string} req.body.kind Agent kind hint (architect, atlas, ...).
 * @returns {{svg:string}} Raw SVG markup (client re-validates before use).
 */
agentIconsRouter.post('/generate', async (req, res) => {
  const userId = Number(req.session?.userId);
  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(401).json({ error: 'authentication_required' });
  }
  if (!iconGenerationEnabled()) {
    return res.status(403).json({
      error: 'icon_generation_disabled',
      message: 'Set CENSAAI_AGENT_ICON_GENERATOR=1 on the server to enable AI icon generation.',
    });
  }
  const prompt = String(req.body?.prompt || '').trim();
  const kind = String(req.body?.kind || 'agent').trim().slice(0, 40) || 'agent';
  if (!prompt) return res.status(400).json({ error: 'prompt_required' });
  if (prompt.length > MAX_PROMPT_CHARS) return res.status(400).json({ error: 'prompt_too_long' });

  try {
    const accessContext = createModelAccessContext({
      userId,
      workspaceId: null,
      source: 'agent-icon-generator',
    });
    const config = resolveChatModelConfig({ modelProvider: 'google' });
    const response = await callModel({
      accessContext,
      config,
      body: {
        model: config.model,
        messages: [
          { role: 'system', content: 'You output only raw SVG markup. Never explain.' },
          { role: 'user', content: buildSvgPrompt({ prompt, kind }) },
        ],
        max_tokens: 2048,
      },
      timeoutMs: 60000,
      logContext: { source: 'agent-icon-generator' },
      usageAttribution: {
        workspaceId: null,
        actor: { kind: 'user', id: userId },
        source: 'agent-icon-generator',
      },
      usageSink: workspaceUsageSink,
    });
    const text = response?.choices?.[0]?.message?.content || response?.text || '';
    const svg = extractSvgMarkup(text);
    if (!svg) return res.status(502).json({ error: 'icon_generation_no_svg' });
    return res.json({ svg });
  } catch (err) {
    return res.status(502).json({ error: 'icon_generation_failed', message: err?.message || String(err) });
  }
});
