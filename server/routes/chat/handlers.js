import { dbReady } from '../../dbState.js';
import {
  callModel,
  createModelAccessContext,
  resolveChatModelConfig,
  workspaceUsageSink,
} from '../../aiGateway/index.js';
import pool from '../../db.js';
import { resolveWorkspaceContext } from '../../workspaces/context.js';
import { sendPublicModelError } from './httpErrors.js';
import { ideaExpandModel } from './ideaExpandModel.js';
import { requireAgentContextRuntime } from '../../agents/familyRuntimeAccess.js';
import { logGroupChatRound, memberMessages, resolveGroupChatMembers, roundWhy } from './groupChatMembers.js';
import { createLogger } from '../../logger.js';
import { safeErrorCode } from '../../security/errorCode.js';

const groupLog = createLogger('group-chat');

export { handleImageGen } from './imageHandler.js';

export async function handleIdeaExpand(req, res) {
  const { ideas = [], title, project, workspaceId } = req.body || {};
  const cleanIdeas = Array.isArray(ideas)
    ? ideas.map(item => String(item || '').trim()).filter(Boolean)
    : String(ideas || '').split('\n').map(item => item.trim()).filter(Boolean);

  if (cleanIdeas.length === 0) {
    return res.status(400).json({ error: 'Add at least one idea bullet to expand.' });
  }
  if (!req.session?.userId) {
    return res.status(401).json({
      error: 'Authentication required', code: 'AUTHENTICATION_REQUIRED', retryAfter: null,
    });
  }

  try {
    const workspace = await resolveWorkspaceContext(pool, {
      userId: req.session.userId,
      workspaceId: workspaceId || null,
    });
    const { provider, model } = await ideaExpandModel(req.session.userId);
    const config = resolveChatModelConfig({ modelProvider: provider, modelName: model });
    const projectLine = project?.name || project?.path
      ? `Project context: ${project.name || 'Untitled project'}${project.path ? ` at ${project.path}` : ''}.`
      : 'No project context has been selected yet.';

    const completion = await callModel({
      accessContext: createModelAccessContext({
        userId: req.session.userId, workspaceId: workspace.id, source: 'idea-expand',
      }),
      config,
      body: {
        model,
        temperature: 0.75,
        messages: [
          {
            role: 'system',
            content: [
              'You expand rough product ideas into useful planning notes.',
              'Keep the output practical, specific, and not too long.',
              'Return clean markdown with these sections: Expanded Idea, Why It Matters, Possible UX, Open Questions, Next Step.',
              'Do not pretend implementation details are known if they are not in the prompt.',
            ].join('\n'),
          },
          {
            role: 'user',
            content: [
              projectLine,
              title ? `Idea pad title: ${title}` : null,
              '',
              'Raw idea bullets:',
              ...cleanIdeas.map(item => `- ${item}`),
            ].filter(Boolean).join('\n'),
          },
        ],
      },
      timeoutMs: 45000,
      logContext: { source: 'idea-expand' },
    });

    const text = completion?.choices?.[0]?.message?.content?.trim();
    res.json({
      text: text || 'No expansion returned.',
      model,
    });
  } catch (err) {
    sendPublicModelError(res, err, 'IDEA_EXPAND_FAILED');
  }
}

export async function handleGroupChat(req, res) {
  const { messages = [], agentIds, workspaceId } = req.body;
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
    const accessContext = createModelAccessContext({
      userId: req.session.userId, workspaceId: workspace.id, source: 'group-chat',
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
      const { agentId, modelConfig } = member;
      const body = {
        model: modelConfig.model,
        max_tokens: 1024, // keep it brief in group chat
        messages: memberMessages(member, currentMessages, names),
      };

      try {
        const data = await callModel({
          accessContext,
          config: modelConfig,
          body,
          logContext: { source: 'group-chat', agentId },
          usageAttribution: {
            workspaceId: workspace.id,
            actor: { kind: 'user', id: req.session.userId },
            source: 'group-chat',
            agentId,
          },
          usageSink: workspaceUsageSink,
        });
        const text = data.choices?.[0]?.message?.content;
        if (text) {
          replies.push({ agentId, text });
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
