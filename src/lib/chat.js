import { chatResponseError, chatStreamError, ChatRequestError } from './chatErrors.js';

export async function sendMessage(agentId, messages) {
  const data = await sendMessageWithMeta(agentId, messages);
  return data.text;
}

export async function sendMessageWithMeta(agentId, messages, opts = {}) {
  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/x-ndjson'
      },
      body: JSON.stringify({ 
        messages, 
        agentId, 
        windowId: opts.windowId,
        workspaceId: opts.workspaceId,
        currentProject: opts.currentProject,
        stream: true 
      }),
      ...(opts.signal ? { signal: opts.signal } : {}),
    });

    if (!res.ok) throw await chatResponseError(res);

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/x-ndjson') && !contentType.includes('text/event-stream')) {
      const data = await res.json();
      return {
        text: data.text,
        timings: data.timings,
        tools: data.tools,
        changeImpact: data.changeImpact,
        projectContext: data.projectContext || [],
      };
    }

    let finalText = '';
    let finalTimings = null;
    let finalTools = [];
    let finalChangeImpact = null;
    let finalProjectContext = [];
    let finalError = null;
    let receivedResult = false;

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    const handleLine = (line) => {
      try {
        const event = JSON.parse(line);
        if (event.type === 'delta') {
          opts.onDelta?.(String(event.text || ''), event.round || 1);
        } else if (event.type === 'status' && opts.onStatusUpdate) {
          opts.onStatusUpdate(event.status, event.detail);
        } else if (event.type === 'change_impact') {
          finalChangeImpact = event.impact;
          opts.onChangeImpact?.(event.impact);
        } else if (event.type === 'result') {
          receivedResult = true;
          finalText = event.text;
          finalTimings = event.timings;
          finalTools = event.tools;
          finalChangeImpact = event.changeImpact || finalChangeImpact;
          finalProjectContext = event.projectContext || [];
        } else if (event.type === 'error') {
          finalError = chatStreamError(event);
        }
      } catch (err) {
        console.error('Failed to parse streaming line:', err, line);
      }
    };

    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        if (buffer.trim()) {
          handleLine(buffer.trim());
        }
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // save the partial line back to buffer
      for (const line of lines) {
        if (line.trim()) {
          handleLine(line.trim());
        }
      }
    }

    if (finalError) throw finalError;
    if (!receivedResult) {
      throw new ChatRequestError('The AI response ended before a final result arrived. Try again.', {
        code: 'CHAT_STREAM_INCOMPLETE',
      });
    }

    return {
      text: finalText,
      timings: finalTimings,
      tools: finalTools,
      changeImpact: finalChangeImpact,
      projectContext: finalProjectContext,
    };
  } catch (err) {
    if (err instanceof ChatRequestError) throw err;
    if (err?.name === 'AbortError') {
      throw new ChatRequestError('Stopped.', { code: 'CHAT_ABORTED' });
    }
    throw new ChatRequestError('The AI service could not be reached. Try again shortly.', {
      code: 'CHAT_NETWORK_ERROR',
      details: { cause: err?.message || String(err) },
    });
  }
}

async function postChatJson(path, body) {
  let res;
  try {
    res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new ChatRequestError('The AI service could not be reached. Try again shortly.', {
      code: 'CHAT_NETWORK_ERROR',
      details: { cause: err?.message || String(err) },
    });
  }
  if (!res.ok) throw await chatResponseError(res);
  return res.json();
}

/** What the agent's current model accepts: { provider, model, capabilities, limits }. */
export async function fetchChatCapabilities(agentId, { workspaceId } = {}) {
  const params = new URLSearchParams();
  if (agentId) params.set('agentId', agentId);
  if (workspaceId) params.set('workspaceId', workspaceId);
  const res = await fetch(`/api/chat/capabilities?${params}`);
  if (!res.ok) throw await chatResponseError(res);
  return res.json();
}

/** Speech-to-text through the agent's provider. Resolves to the transcript. */
export async function transcribeSpeech(agentId, audioDataUrl, { workspaceId } = {}) {
  const data = await postChatJson('/api/chat/transcribe', { agentId, workspaceId, audio: audioDataUrl });
  return String(data?.text || '');
}

/** Text-to-speech through the agent's provider. Resolves to an audio data URL. */
export async function synthesizeSpeech(agentId, text, { workspaceId } = {}) {
  const data = await postChatJson('/api/chat/speech', { agentId, workspaceId, text });
  return data?.audio || null;
}
