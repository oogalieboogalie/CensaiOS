import { dbReady } from '../../dbState.js';
import { getAgentsByIds, buildSystemPrompt } from '../../memory.js';
import {
  callModel,
  createModelAccessContext,
  IMAGE_GENERATION_MODEL_KIND,
  resolveChatModelConfig,
  resolveImageGenerationModelConfig,
  workspaceUsageSink,
} from '../../aiGateway/index.js';
import pool from '../../db.js';
import { resolveWorkspaceContext } from '../../workspaces/context.js';
import { sendPublicModelError } from './httpErrors.js';
import {
  requireAgentContextRuntime,
  requireFamilyAgentIds,
  requireFamilyRows,
} from '../../agents/familyRuntimeAccess.js';

export async function handleImageGen(req, res) {
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: 'Missing prompt' });

  try {
    const config = resolveImageGenerationModelConfig({ modelProvider: 'google' });
    const response = await callModel({
      kind: IMAGE_GENERATION_MODEL_KIND,
      config,
      body: {
        model: config.model,
        prompt,
      },
      logContext: { source: 'image-generation' },
    });

    let base64Image = null;
    let mimeType = 'image/png';

    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData) {
        base64Image = part.inlineData.data;
        mimeType = part.inlineData.mimeType || 'image/png';
        break;
      }
    }

    if (!base64Image) {
      throw new Error('No image returned by Gemini');
    }

    res.json({ image: `data:${mimeType};base64,${base64Image}` });
  } catch (err) {
    sendPublicModelError(res, err, 'IMAGE_GENERATION_FAILED');
  }
}

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
    const model = process.env.IDEA_EXPAND_MODEL || 'gemini-2.5-flash';
    const config = resolveChatModelConfig({ modelProvider: 'google', modelName: model });
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
  const { messages, agentIds, workspaceId } = req.body;
  if (!agentIds || !agentIds.length) return res.status(400).json({ error: 'No agents provided' });

  try {
    const familyAgentIds = requireFamilyAgentIds(agentIds);
    requireAgentContextRuntime(dbReady());
    const workspace = await resolveWorkspaceContext(pool, {
      userId: req.session.userId,
      workspaceId: workspaceId || null,
    });
    const accessContext = createModelAccessContext({
      userId: req.session.userId, workspaceId: workspace.id, source: 'group-chat',
    });
    const replies = [];
    const currentMessages = [...messages];

    const agentsMap = {};
    const fetchedAgents = requireFamilyRows(
      familyAgentIds,
      await getAgentsByIds(familyAgentIds),
    );
    for (const agent of fetchedAgents) {
      agentsMap[agent.id] = agent;
    }

    for (const agentId of familyAgentIds) {
      let modelConfig = resolveChatModelConfig();
      let systemPrompt = 'You are a helpful assistant.';

      try {
        const agent = agentsMap[agentId];
        if (agent.model_name) {
          modelConfig = resolveChatModelConfig({
            modelProvider: agent.model_provider,
            modelName: agent.model_name,
          });
        }

        const memoryPrompt = await buildSystemPrompt(
          agentId,
          currentMessages[currentMessages.length - 1]?.text,
          { workspaceId: workspace.id, userId: req.session.userId },
        );
        if (!memoryPrompt) requireFamilyRows([agentId], []);
        systemPrompt = memoryPrompt;
      } catch (err) {
        if (String(err?.code || '').startsWith('FAMILY_AGENT_')) throw err;
        throw Object.assign(new Error('Family context is temporarily unavailable.'), {
          code: 'AGENT_CONTEXT_UNAVAILABLE',
          statusCode: 503,
        });
      }

      const chatMessages = [
        { role: 'system', content: systemPrompt },
        ...currentMessages.map(m => {
          if (m.from === 'me') return { role: 'user', content: m.text };
          if (m.from === 'system') return { role: 'user', content: `[SYSTEM]: ${m.text}` };
          // 'agent' is the legacy 1:1 sender tag (pre-agent.id); it can only mean this agent.
          if (m.from === agentId || m.from === 'agent') return { role: 'assistant', content: m.text };
          return { role: 'user', content: `[${m.from}]: ${m.text}` };
        }),
      ];

      const body = {
        model: modelConfig.model,
        max_tokens: 1024, // keep it brief in group chat
        messages: chatMessages,
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
        }
      } catch (err) {
        if (err?.name === 'ModelAccessError' || (err?.code && (err?.statusCode || err?.status))) {
          throw err;
        }
        console.error(`Group Chat model error for ${agentId}:`, err.message);
      }
    }

    res.json({ replies });
  } catch (err) {
    sendPublicModelError(res, err, 'GROUP_CHAT_FAILED');
  }
}
