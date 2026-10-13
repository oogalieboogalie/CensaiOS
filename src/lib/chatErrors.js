export class ChatRequestError extends Error {
  constructor(message, { status = 0, code = 'CHAT_REQUEST_FAILED', retryAfter = null, details = null } = {}) {
    super(message);
    this.name = 'ChatRequestError';
    this.status = status;
    this.code = code;
    this.retryAfter = retryAfter;
    this.details = details;
  }
}

export async function chatResponseError(response) {
  const body = await response.json().catch(() => ({}));
  const retryHeader = response.headers?.get?.('retry-after');
  const retryAfter = body.retryAfter ?? body.retry_after ?? retryHeader ?? null;
  const message = body.message || body.error || body.text || `Chat request failed (${response.status}).`;
  return new ChatRequestError(message, {
    status: response.status,
    code: body.code || 'CHAT_REQUEST_FAILED',
    retryAfter,
    details: body,
  });
}

export function chatStreamError(payload = {}) {
  const error = payload.error && typeof payload.error === 'object' ? payload.error : payload;
  return new ChatRequestError(error.message || 'The AI request could not be completed.', {
    status: error.status || 0,
    code: error.code || 'CHAT_STREAM_FAILED',
    retryAfter: error.retryAfter ?? null,
    details: error,
  });
}
