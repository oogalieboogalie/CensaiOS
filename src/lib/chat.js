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
        if (event.type === 'status' && opts.onStatusUpdate) {
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
    throw new ChatRequestError('The AI service could not be reached. Try again shortly.', {
      code: 'CHAT_NETWORK_ERROR',
      details: { cause: err?.message || String(err) },
    });
  }
}
