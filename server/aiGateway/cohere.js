import { getSecret } from '../secrets.js';

export const COHERE_CHAT_BASE_URL = 'https://api.cohere.ai/compatibility/v1';
export const COHERE_DEFAULT_CHAT_MODEL = 'north-mini-code-1-0';

export function getCohereApiKey() {
  return getSecret('COHERE_API_KEY')
    || getSecret('COHERE_PAID_API_KEY')
    || getSecret('COHERE_NON_COMMERCIAL_KEY')
    || '';
}

export function getCohereChatBaseUrl() {
  return process.env.COHERE_CHAT_BASE_URL || COHERE_CHAT_BASE_URL;
}
