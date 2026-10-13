const PRIVATE_TOOL_NAMES = new Set(['journal', 'read_journal', 'read_journal_search']);
const SAFE_SUMMARY_FIELDS = new Map([
  ['project_edit', ['path', 'added', 'removed']],
  ['project_multi_edit', ['path', 'files', 'added', 'removed']],
  ['project_write', ['path', 'added']],
  ['local_write_file', ['path', 'added']],
  ['github_write_file', ['path', 'added']],
  ['project_read', ['path']],
  ['project_file_outline', ['path']],
  ['local_read_file', ['path']],
  ['github_read_file', ['path']],
  ['project_list', ['path']],
  ['local_list_dir', ['path']],
]);
const TRACE_EVENT_TYPES = new Set(['agent.round', 'tool.invocation', 'session.failure']);
const TRACE_STATUSES = new Set(['active', 'success', 'failed']);
const MAX_METADATA_TEXT = 160;

export const PRIVATE_TRACE_EVENT_TYPES = Object.freeze(['tool.invocation', 'session.failure']);
function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : undefined;
}
function safeIdentifier(value) {
  const text = String(value || '').trim();
  if (!text || text.length > MAX_METADATA_TEXT || !/^[a-zA-Z0-9_.:/-]+$/.test(text)) return undefined;
  return text;
}
function safeMetadataText(value) {
  const text = String(value || '').trim();
  if (!text || text.length > MAX_METADATA_TEXT || /[\r\n?]/.test(text)) return undefined;
  if (/(authorization|bearer|password|secret|token|api[_-]?key)/i.test(text)) return undefined;
  return text;
}
function safeTimestamp(value) {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}
function definedEntries(input) {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}
function sanitizeSummary(toolName, summary) {
  const allowed = SAFE_SUMMARY_FIELDS.get(toolName);
  if (!allowed || !summary || typeof summary !== 'object') return undefined;
  const safe = {};
  for (const key of allowed) {
    const value = summary[key];
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) safe[key] = value;
    if (typeof value === 'string') {
      const text = safeMetadataText(value);
      if (text) safe[key] = text;
    }
  }
  return Object.keys(safe).length ? safe : undefined;
}
function resultMetadata(result) {
  if (result === null) return { resultType: 'null', resultLength: 0 };
  if (typeof result === 'string') return { resultType: 'string', resultLength: result.length };
  if (Array.isArray(result)) return { resultType: 'array', resultLength: result.length };
  if (ArrayBuffer.isView(result)) return { resultType: 'binary', resultLength: result.byteLength };
  if (result && typeof result === 'object') {
    return { resultType: 'object', resultLength: Object.keys(result).length };
  }
  return { resultType: typeof result, resultLength: result === undefined ? 0 : 1 };
}
export function isPrivateTraceTool(toolName) {
  return PRIVATE_TOOL_NAMES.has(String(toolName || '').trim().toLowerCase());
}

export function safeToolLogMetadata(toolName, args) {
  const privateTool = isPrivateTraceTool(toolName);
  const argumentCount = privateTool || !args || typeof args !== 'object'
    ? 0
    : Object.keys(args).filter(key => !key.startsWith('__')).length;
  return {
    argumentCount,
    ...(privateTool ? { private: true, redacted: true } : {}),
  };
}

export function sanitizeTraceInitialContext(initialContext) {
  return definedEntries({ messagesCount: finiteNumber(initialContext?.messagesCount) });
}

export function sanitizeTraceRoundPayload(input = {}) {
  const messagesCount = Array.isArray(input.messages) ? input.messages.length : input.messagesCount;
  const toolsAvailableCount = Array.isArray(input.toolsAvailable)
    ? input.toolsAvailable.length
    : input.toolsAvailableCount;
  const model = safeIdentifier(input.modelConfig?.model);
  return definedEntries({
    round: finiteNumber(input.round),
    messagesCount: finiteNumber(messagesCount),
    toolsAvailableCount: finiteNumber(toolsAvailableCount),
    modelConfig: model ? { model } : undefined,
  });
}

export function sanitizeToolTracePayload(input = {}) {
  const toolName = safeIdentifier(input.toolName) || 'unknown';
  const privateTool = Boolean(input.privateTool) || isPrivateTraceTool(toolName);
  const common = definedEntries({
    toolName,
    ms: finiteNumber(input.ms),
    ok: typeof input.ok === 'boolean' ? input.ok : false,
    round: finiteNumber(input.round),
  });
  if (privateTool) {
    return { ...common, private: true, arguments: '[redacted]', result: '[redacted]' };
  }
  return definedEntries({
    ...common,
    summary: sanitizeSummary(toolName, input.summary),
    ...resultMetadata(input.result ?? input.resultPreview),
  });
}

export function sanitizeTraceFailurePayload(input = {}) {
  const context = input.contextSnapshot && typeof input.contextSnapshot === 'object'
    ? input.contextSnapshot
    : {};
  return definedEntries({
    failure: 'Execution failed',
    ok: false,
    toolName: safeIdentifier(context.toolName),
    round: finiteNumber(context.round),
    messagesCount: finiteNumber(context.messagesCount ?? context.chatMessagesCount),
  });
}

export function sanitizeTraceTimings(timings) {
  const safe = {};
  for (const key of ['setup_ms', 'model_ms', 'tool_ms', 'total_ms']) {
    const value = finiteNumber(timings?.[key]);
    if (value !== undefined) safe[key] = value;
  }
  if (Array.isArray(timings?.model_calls)) safe.model_calls_count = timings.model_calls.length;
  if (Array.isArray(timings?.tool_calls)) safe.tool_calls_count = timings.tool_calls.length;
  return safe;
}

export function sanitizeTraceArtifact(artifact = {}) {
  const data = artifact.data && typeof artifact.data === 'object' ? artifact.data : {};
  const { data: _data, metadata: _metadata, source_ref: _sourceRef, ...row } = artifact;
  const status = TRACE_STATUSES.has(data.status) ? data.status : undefined;
  const finalTextLength = finiteNumber(data.finalTextLength)
    ?? (typeof data.finalTextPreview === 'string' ? data.finalTextPreview.length : undefined);
  return {
    ...row,
    data: definedEntries({
      agentId: safeIdentifier(data.agentId),
      windowId: safeIdentifier(data.windowId),
      initialContext: sanitizeTraceInitialContext(data.initialContext),
      status,
      startedAt: safeTimestamp(data.startedAt),
      endedAt: safeTimestamp(data.endedAt),
      finalTextLength,
      timings: Object.keys(sanitizeTraceTimings(data.timings)).length
        ? sanitizeTraceTimings(data.timings)
        : undefined,
      totalTokens: finiteNumber(data.totalTokens),
    }),
    metadata: data.source === 'chat_api' || artifact.metadata?.source === 'chat_api'
      ? { source: 'chat_api' }
      : {},
  };
}

export function sanitizeTraceEvent(event = {}, { strict = false } = {}) {
  const type = String(event.event_type || '');
  let payload;
  if (type === 'agent.round') payload = sanitizeTraceRoundPayload(event.payload);
  else if (type === 'tool.invocation') payload = sanitizeToolTracePayload(event.payload);
  else if (type === 'session.failure') payload = sanitizeTraceFailurePayload(event.payload);
  else if (strict) payload = { redacted: true };
  else return event;
  return { ...event, payload };
}

export function isTraceEventType(type) {
  return TRACE_EVENT_TYPES.has(String(type || ''));
}

export function publicOperationalError(error, fallbackStatus = 400) {
  const candidate = Number(error?.statusCode ?? error?.status ?? fallbackStatus);
  const status = Number.isInteger(candidate) && candidate >= 400 && candidate <= 599
    ? candidate
    : fallbackStatus;
  const messages = {
    400: 'Invalid operational intelligence request',
    401: 'Authenticated user required',
    403: 'Workspace access denied',
    404: 'Requested resource not found',
  };
  return {
    status,
    body: { error: messages[status] || 'Operational intelligence unavailable' },
  };
}
