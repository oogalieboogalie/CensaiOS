import { jest } from '@jest/globals';

export const featureEnabled = jest.fn();
export const getRuntimeMode = jest.fn();
export const getSecret = jest.fn();
export const db = { query: jest.fn(), connect: jest.fn() };
export const requireWorkspaceMember = jest.fn();
export const inferUserApiKeyProvider = jest.fn();
export const getUserApiKeyConfig = jest.fn();
export const reserveFreeTierAllowance = jest.fn();
export const consumeFreeTierAllowance = jest.fn();
export const releaseFreeTierAllowance = jest.fn();
export const requestChatCompletion = jest.fn();
export const requestEmbedding = jest.fn();
export const requestImageGeneration = jest.fn();
export const resolveChatModelConfig = jest.fn();
export const resolveEmbeddingModelConfig = jest.fn();
export const resolveImageGenerationModelConfig = jest.fn();

jest.unstable_mockModule('../../server/middleware/runtimeMode.js', () => ({
  isFeatureEnabled: featureEnabled,
  getRuntimeMode,
  RUNTIME_MODES: {
    LOCAL_DESKTOP: 'local_desktop',
    PRIVATE_SERVER: 'private_server',
    CLOUD_SAAS: 'cloud_saas',
  },
}));
jest.unstable_mockModule('../../server/secrets.js', () => ({ getSecret }));
jest.unstable_mockModule('../../server/db.js', () => ({ default: db }));
jest.unstable_mockModule('../../server/workspaces/context.js', () => ({ requireWorkspaceMember }));
jest.unstable_mockModule('../../server/security/userApiKeys.js', () => ({
  inferUserApiKeyProvider,
  getUserApiKeyConfig,
}));
jest.unstable_mockModule('../../server/aiGateway/freeTierAllowance.js', () => ({
  reserveFreeTierAllowance,
  consumeFreeTierAllowance,
  releaseFreeTierAllowance,
}));
jest.unstable_mockModule('../../server/aiGateway/chatCompletion.js', () => ({ requestChatCompletion }));
jest.unstable_mockModule('../../server/aiGateway/providers.js', () => ({ resolveChatModelConfig }));
jest.unstable_mockModule('../../server/aiGateway/embedding.js', () => ({
  EMBEDDING_MODEL_KIND: 'embedding',
  requestEmbedding,
}));
jest.unstable_mockModule('../../server/aiGateway/embeddingProviders.js', () => ({
  resolveEmbeddingModelConfig,
}));
jest.unstable_mockModule('../../server/aiGateway/imageGeneration.js', () => ({
  IMAGE_GENERATION_MODEL_KIND: 'image.generation',
  requestImageGeneration,
}));
jest.unstable_mockModule('../../server/aiGateway/imageProviders.js', () => ({
  resolveImageGenerationModelConfig,
}));

const callModelModule = await import('../../server/aiGateway/callModel.js');
const modelAccessModule = await import('../../server/aiGateway/modelAccess.js');

export const { callModel, EMBEDDING_MODEL_KIND, IMAGE_GENERATION_MODEL_KIND } = callModelModule;
export const { createModelAccessContext, ModelAccessError } = modelAccessModule;

function allowanceStatus() {
  const reset = new Date(Date.now() + 60_000).toISOString();
  return {
    user: { limit: 8, used: 0, reserved: 1, remaining: 7, resetsAt: reset },
    shared: { limit: 40, used: 0, reserved: 1, remaining: 39, resetsAt: reset },
    minute: { limit: 10, used: 1, reserved: 0, remaining: 9, resetsAt: reset },
  };
}

export function resetAccessHarness() {
  jest.clearAllMocks();
  featureEnabled.mockReturnValue(true);
  getRuntimeMode.mockReturnValue('cloud_saas');
  getSecret.mockReturnValue('platform-key');
  db.query.mockResolvedValue({ rows: [{ role: 'user' }] });
  requireWorkspaceMember.mockResolvedValue({ id: 'workspace-a', role: 'member' });
  inferUserApiKeyProvider.mockReturnValue('openrouter');
  getUserApiKeyConfig.mockResolvedValue(null);
  reserveFreeTierAllowance.mockResolvedValue({
    allowed: true,
    dispatchAllowed: true,
    correlationId: '20000000-0000-4000-8000-000000000001',
    status: allowanceStatus(),
  });
  consumeFreeTierAllowance.mockResolvedValue({ state: 'consumed' });
  releaseFreeTierAllowance.mockResolvedValue({ state: 'released' });
  requestChatCompletion.mockResolvedValue({
    choices: [{ message: { role: 'assistant', content: 'hello' } }],
  });
  requestEmbedding.mockResolvedValue({ data: [{ embedding: [1] }] });
  requestImageGeneration.mockResolvedValue({ candidates: [] });
  resolveChatModelConfig.mockReturnValue({
    provider: 'openrouter',
    model: 'requested-paid-model',
    baseUrl: 'https://openrouter.ai/api/v1',
    apiKey: 'caller-or-server-key',
  });
  resolveEmbeddingModelConfig.mockReturnValue({
    provider: 'openrouter', model: 'embed-model', baseUrl: 'https://openrouter.ai/api/v1',
    apiKey: 'caller-or-server-key',
  });
  resolveImageGenerationModelConfig.mockReturnValue({
    provider: 'google', model: 'image-model', apiKey: 'caller-or-server-key',
  });
}
