import {
  callModel,
  createModelAccessContext,
  resolveChatModelConfig,
} from '../../aiGateway/index.js';
import pool from '../../db.js';
import { resolveWorkspaceContext } from '../../workspaces/context.js';
import { sendPublicModelError } from './httpErrors.js';
import { ideaExpandModel } from './ideaExpandModel.js';
export { handleImageGen } from './imageHandler.js';
export { handleGroupChat } from './groupChat.js';

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
