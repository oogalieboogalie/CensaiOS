import { summarizeToolCall } from './toolSummary.js';

const MARKER_PATTERN = /\[(REMEMBER_IMPORTANT|READ_JOURNAL_SEARCH|READ_ASSOCIATIONS|QUERY_KNOWLEDGE|READ_JOURNAL|READ_MESSAGES|MESSAGE_TO|REMEMBER|ASSOCIATE|BROADCAST|JOURNAL|FEELING|RECALL|NUGGET|KNOW)(?::\s*([\s\S]*?))?\]/gi;

const MARKER_TO_TOOL = {
  REMEMBER: 'remember',
  REMEMBER_IMPORTANT: 'remember_important',
  JOURNAL: 'journal',
  KNOW: 'know',
  NUGGET: 'nugget',
  ASSOCIATE: 'associate',
  FEELING: 'feeling',
  MESSAGE_TO: 'message_to',
  BROADCAST: 'broadcast',
  RECALL: 'recall',
  READ_JOURNAL: 'read_journal',
  READ_JOURNAL_SEARCH: 'read_journal_search',
  QUERY_KNOWLEDGE: 'query_knowledge',
  READ_MESSAGES: 'read_messages',
  READ_ASSOCIATIONS: 'read_associations',
};

const PRIVATE_MARKERS = new Set(['JOURNAL', 'READ_JOURNAL', 'READ_JOURNAL_SEARCH']);

function cleanMarkerContent(value = '') {
  const trimmed = String(value || '').trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function splitOnce(value, separator) {
  const index = value.indexOf(separator);
  if (index < 0) return [value.trim(), ''];
  return [value.slice(0, index).trim(), value.slice(index + separator.length).trim()];
}

function markerArgs(kind, rawContent) {
  const content = cleanMarkerContent(rawContent);
  switch (kind) {
    case 'REMEMBER':
    case 'REMEMBER_IMPORTANT':
    case 'JOURNAL':
    case 'BROADCAST':
      return content ? { content } : null;
    case 'FEELING':
      return content ? { emotion: content } : null;
    case 'RECALL':
    case 'READ_JOURNAL_SEARCH':
      return content ? { query: content } : null;
    case 'READ_ASSOCIATIONS':
      return content ? { concept: content } : null;
    case 'QUERY_KNOWLEDGE':
      return content ? { subject: content } : null;
    case 'READ_JOURNAL':
    case 'READ_MESSAGES':
      return {};
    case 'KNOW': {
      const parts = content.split('|').map(part => part.trim()).filter(Boolean);
      if (parts.length < 3) return null;
      return { subject: parts[0], predicate: parts[1], object: parts.slice(2).join(' | ') };
    }
    case 'NUGGET': {
      const [title, body] = splitOnce(content, '|');
      return title && body ? { title, content: body } : null;
    }
    case 'ASSOCIATE': {
      const [conceptA, conceptB] = content.includes('<->')
        ? splitOnce(content, '<->')
        : splitOnce(content, '|');
      return conceptA && conceptB ? { concept_a: conceptA, concept_b: conceptB } : null;
    }
    case 'MESSAGE_TO': {
      const [agent, body] = splitOnce(content, ':');
      return agent && body ? { agent, content: body } : null;
    }
    default:
      return null;
  }
}

function cleanupVisibleText(text) {
  return String(text || '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

export function extractAgentMarkers(text) {
  const markers = [];
  const cleaned = String(text || '').replace(MARKER_PATTERN, (full, rawKind, rawContent = '') => {
    const kind = rawKind.toUpperCase();
    const args = markerArgs(kind, rawContent);
    markers.push({
      kind,
      tool: MARKER_TO_TOOL[kind],
      args,
      raw: full,
      private: PRIVATE_MARKERS.has(kind),
      valid: !!MARKER_TO_TOOL[kind] && args !== null,
    });
    return '';
  });

  return {
    text: cleanupVisibleText(cleaned),
    markers,
  };
}

export async function processAgentMarkers(agentId, text, executeTool, sendEvent) {
  const { text: visibleText, markers } = extractAgentMarkers(text);
  const actions = [];

  for (const marker of markers) {
    if (!marker.valid) {
      actions.push({
        tool: marker.tool || marker.kind.toLowerCase(),
        args: {},
        result: `Marker parse error: ${marker.raw}`,
        result_preview: `Marker parse error: ${marker.raw}`,
        result_chars: marker.raw.length,
        ms: 0,
        round: 'marker',
      });
      continue;
    }

    const summary = marker.private ? null : summarizeToolCall(marker.tool, marker.args);
    const safeArgs = marker.private ? {} : marker.args;
    sendEvent?.({
      type: 'status',
      status: 'calling_tool',
      detail: { tool: marker.tool, args: safeArgs, phase: 'marker', ...(summary ? { summary } : {}) },
    });

    const startedAt = Date.now();
    const result = await executeTool(agentId, marker.tool, marker.args);
    const ms = Date.now() - startedAt;
    sendEvent?.({
      type: 'status',
      status: 'completed_tool',
      detail: { tool: marker.tool, ms, phase: 'marker', ...(summary ? { summary } : {}) },
    });
    const safeResult = marker.private ? '[private]' : result;
    const resultText = typeof safeResult === 'string' ? safeResult : JSON.stringify(safeResult);
    actions.push({
      tool: marker.tool,
      args: safeArgs,
      ...(summary ? { summary } : {}),
      result: safeResult,
      result_preview: resultText.length > 260 ? `${resultText.slice(0, 260)}...` : resultText,
      result_chars: resultText.length,
      ms,
      round: 'marker',
    });
  }

  return { text: visibleText, actions, markers };
}
