// The MLOps Dashboard's "Add a model" form: name, provider, what it is for.
// Returns clean fields or a plain-words problem the window can show as is.
export const MODEL_PROVIDERS = ['OpenAI', 'Anthropic', 'Google', 'xAI', 'Hugging Face', 'Self-hosted', 'Other'];
const MAX_NAME = 80;
const MAX_PURPOSE = 280;

const text = (value) => (typeof value === 'string' ? value.trim() : '');

export function cleanModelInput(body = {}) {
  const modelName = text(body.modelName);
  if (!modelName) return { problem: 'Give the model a name.' };
  if (modelName.length > MAX_NAME) return { problem: `Keep the name under ${MAX_NAME} characters.` };
  const provider = text(body.provider) || 'Other';
  if (!MODEL_PROVIDERS.includes(provider)) return { problem: `Pick a provider from the list (${MODEL_PROVIDERS.join(', ')}).` };
  const purpose = text(body.purpose).slice(0, MAX_PURPOSE);
  const version = text(String(body.version ?? '')) || '1';
  return { model: { modelName, provider, purpose, version } };
}
