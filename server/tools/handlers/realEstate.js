import { randomUUID } from 'node:crypto';
import pool from '../../db.js';
import { requireWorkspaceMember } from '../../workspaces/context.js';
import { getSubAgentById } from '../../memory.js';
import { checkFairHousing } from '../../../src/lib/realEstate/fairHousing.js';
import { appendToTemplateWindow, findTemplateWindow, readBoardWindows } from '../../realEstate/boardWrites.js';
import { describeDeadline, dueDeadlines } from '../../realEstate/deadlines.js';

// Spec 7 tool handlers. Each one acts only on the caller's own board.

function clip(value, max) {
  return String(value ?? '').trim().slice(0, max);
}

async function boardScope(context, { write = false } = {}) {
  const workspaceId = clip(context?.workspaceId, 128);
  const userId = context?.userId;
  if (!workspaceId || !userId) throw new Error('This tool needs a signed-in board.');
  await requireWorkspaceMember(pool, { workspaceId, userId, ...(write ? { roles: ['owner', 'admin', 'member'] } : {}) });
  return { workspaceId, userId };
}

async function agentName(agentId, scope) {
  const sub = await getSubAgentById(agentId, scope).catch(() => null);
  return sub?.name || agentId;
}

export function formatFairHousing(result) {
  if (!result.flags.length) return 'Fair-housing check: no risky words found.';
  const lines = result.flags.map(flag => `- "${flag.term}" (${flag.category}, ${flag.severity === 'risk' ? 'rewrite' : 'review'}): ${flag.reason} Suggestion: ${flag.suggestion}`);
  return `Fair-housing check: ${result.ok ? 'nothing that must change, but review these' : 'rewrite before publishing'}.\n${lines.join('\n')}`;
}

export async function handleRealEstateTool(agentId, name, args = {}, context = {}) {
  switch (name) {
    case 'fair_housing_check':
      return formatFairHousing(checkFairHousing(clip(args.text, 8000)));

    case 'post_team_chat': {
      const scope = await boardScope(context, { write: true });
      const text = clip(args.text, 1000);
      if (!text) return 'Error: the message is empty.';
      const windowId = await appendToTemplateWindow(pool, { workspaceId: scope.workspaceId, role: 'teamChat', field: 'msgs', owner: agentId, item: { from: agentId, text, at: new Date().toISOString() } });
      return windowId ? 'Posted in Team Chat.' : 'Error: this board has no Team Chat window. Ask the user to start a ready-made board (Add, Ready-made boards).';
    }

    case 'draft_client_message': {
      const scope = await boardScope(context, { write: true });
      const body = clip(args.body, 4000);
      const to = clip(args.to, 120);
      if (!body || !to) return 'Error: a draft needs a recipient and a message.';
      const channel = args.channel === 'text' ? 'text' : 'email';
      const check = checkFairHousing(`${clip(args.subject, 200)}\n${body}`);
      const draft = {
        id: `d-${randomUUID().slice(0, 12)}`,
        status: 'pending',
        channel,
        to,
        address: clip(args.address, 200),
        subject: channel === 'email' ? clip(args.subject, 200) : '',
        body,
        deal: clip(args.deal, 160),
        agentId,
        agentName: await agentName(agentId, scope),
        flags: check.flags,
        createdAt: new Date().toISOString(),
      };
      const windowId = await appendToTemplateWindow(pool, { workspaceId: scope.workspaceId, role: 'outbox', field: 'drafts', item: draft });
      if (!windowId) return 'Error: this board has no Outbox window, so the draft was not saved.';
      const warn = check.flags.length ? ` ${formatFairHousing(check)}` : '';
      return `Draft to ${to} is waiting in the Outbox for a teammate to approve. It has not been sent.${warn}`;
    }

    case 'deal_deadlines': {
      const scope = await boardScope(context);
      const days = Math.min(60, Math.max(0, Number(args.days_ahead) || 7));
      const windows = await readBoardWindows(pool, scope.workspaceId);
      const pipeline = findTemplateWindow(windows, 'dealPipeline');
      if (!pipeline) return 'This board has no Deal pipeline window.';
      const due = dueDeadlines(pipeline.moduleData?.deals, { daysAhead: days });
      if (!due.length) return `No open deadlines in the next ${days} days.`;
      return `Open deadlines (next ${days} days):\n${due.map(item => `- ${describeDeadline(item)}`).join('\n')}`;
    }

    default:
      throw new Error(`Unknown real estate tool: ${name}`);
  }
}
