// POST /api/group-chat: everyone in the chat answers in turn, Lead first in a
// team room. Each member runs through the same engine as its own chat window
// (server/runEngine), so it can use the tools it was given: the Researcher
// searches the web, the Builder writes onto the board or into project files.
// Before this, a group chat called the model with no tools at all.

import { dbReady } from '../../dbState.js';
import pool from '../../db.js';
import { resolveWorkspaceContext } from '../../workspaces/context.js';
import { sendPublicModelError } from './httpErrors.js';
import { requireAgentContextRuntime } from '../../agents/familyRuntimeAccess.js';
import { groupTurnMessages, logGroupChatRound, resolveGroupChatMembers, roundWhy } from './groupChatMembers.js';
import { createLogger } from '../../logger.js';
import { safeErrorCode } from '../../security/errorCode.js';

const groupLog = createLogger('group-chat');

// What the window shows above a reply: which tools ran, never their results.
function toolsShown(toolActions) {
  if (!toolActions?.length) return null;
  return toolActions.map(({ tool, ms, ok, summary, result_chars: resultChars }) => ({
    tool, ms, result_chars: resultChars,
    ...(typeof ok === 'boolean' ? { ok } : {}),
    ...(summary ? { summary } : {}),
  }));
}

// One member's turn, tools included, stops after this long.
export const MEMBER_TURN_MS = 180000;

async function defaultRunTurn(input) {
  const { runAgentTurn } = await import('../../runEngine/index.js');
  return runAgentTurn(input);
}

// Express passes next() third; only tests pass { runTurn }.
export async function handleGroupChat(req, res, deps) {
  const runTurn = typeof deps?.runTurn === 'function' ? deps.runTurn : defaultRunTurn;
  const { messages = [], agentIds, workspaceId, windowId = null } = req.body || {};
  if (!agentIds || !agentIds.length) return res.status(400).json({ error: 'No agents provided' });

  let logged = false;
  const say = (answered, asked, why) => {
    if (logged) return;
    logged = true;
    logGroupChatRound({ answered, asked, why });
  };

  try {
    requireAgentContextRuntime(dbReady());
    const workspace = await resolveWorkspaceContext(pool, {
      userId: req.session.userId,
      workspaceId: workspaceId || null,
    });
    const currentMessages = [...messages];
    const members = await resolveGroupChatMembers(agentIds, {
      workspaceId: workspace.id,
      userId: req.session.userId,
      userRole: req.session?.userRole || null,
      lastText: currentMessages[currentMessages.length - 1]?.text,
      historyInRequest: currentMessages.length > 1,
    });
    const names = Object.fromEntries(members.map(member => [member.agentId, member.name]));
    const replies = [];
    let quiet = 0;
    let quietWhy = '';

    for (const member of members) {
      const { agentId } = member;
      try {
        const { finalText, toolActions = [] } = await runTurn({
          origin: 'chat',
          agentId,
          messages: groupTurnMessages(member, currentMessages, names),
          userId: req.session.userId,
          userRole: req.session?.userRole || null,
          workspaceId: workspace.id,
          windowId: typeof windowId === 'string' ? windowId : null,
          loopWorkspaceId: workspace.id,
          timeoutMs: MEMBER_TURN_MS,
        });
        const text = String(finalText || '').trim();
        if (text) {
          const tools = toolsShown(toolActions);
          replies.push(tools ? { agentId, text, tools } : { agentId, text });
          currentMessages.push({ from: agentId, text });
        } else {
          quiet += 1;
        }
      } catch (err) {
        if (err?.name === 'ModelAccessError' || (err?.code && (err?.statusCode || err?.status))) {
          say(replies.length, members.length, roundWhy(err, quiet));
          throw err;
        }
        quiet += 1;
        quietWhy = quietWhy || 'model error';
        groupLog.warn('member reply failed: model error', { code: safeErrorCode(err) });
      }
    }

    say(replies.length, members.length, quietWhy || roundWhy(null, quiet));
    res.json({ replies });
  } catch (err) {
    say(0, Array.isArray(agentIds) ? agentIds.length : 0, roundWhy(err));
    sendPublicModelError(res, err, 'GROUP_CHAT_FAILED');
  }
}
