const CHAT_KIND = 'chat.completion';

export async function resolveUserModelAccess({ input, context, attribution, policy }) {
  const userKeys = await import('../security/userApiKeys.js');
  const provider = userKeys.inferUserApiKeyProvider(
    input.config?.provider || input.modelProvider,
    input.config?.baseUrl,
  );
  const exactKey = provider
    ? await userKeys.getUserApiKeyConfig(context.userId, provider)
    : null;
  if (exactKey) {
    return {
      governed: true,
      mode: 'byok',
      context,
      attribution,
      userKey: exactKey,
      keyProvider: provider,
    };
  }
  if (!policy || input.kind !== CHAT_KIND || provider === 'openrouter') return null;
  const openRouterKey = await userKeys.getUserApiKeyConfig(context.userId, 'openrouter');
  if (!openRouterKey) return null;
  return {
    governed: true,
    mode: 'byok-free',
    context,
    attribution,
    userKey: openRouterKey,
    policy,
  };
}

export function applyUserModelAccess(access, { config, body, retry }) {
  if (access.mode === 'byok') {
    const model = access.userKey.modelName || config.model;
    return {
      config: { ...config, apiKey: access.userKey.apiKey, model },
      body: access.userKey.modelName ? { ...body, model } : body,
      retry,
    };
  }
  return {
    config: {
      provider: access.policy.provider,
      model: access.policy.model,
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKey: access.userKey.apiKey,
    },
    body: { ...body, model: access.policy.model },
    retry: { maxRetries: 0 },
  };
}
