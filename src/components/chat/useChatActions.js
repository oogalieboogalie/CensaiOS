import React from 'react';
import { api } from '../../lib/api.js';
import { updateAgent } from '../../lib/agentStore.js';
import { branchChat, sendToCanvas } from '../../lib/chat/sendToCanvas.js';

/**
 * The spec 3 message actions for a chat window: retry, branch, send to
 * canvas, and switching the agent's model from the composer chip.
 */
export function useChatActions({ win, agent, msgs, setMsgs, send, sending }) {
  const [modelStatus, setModelStatus] = React.useState(null);

  const retry = React.useCallback((index) => {
    if (sending) return;
    let upTo = index;
    while (upTo >= 0 && msgs[upTo]?.from !== 'me') upTo -= 1;
    if (upTo < 0) return;
    const base = msgs.slice(0, upTo + 1);
    setMsgs(base);
    send(base);
  }, [msgs, setMsgs, send, sending]);

  const branch = React.useCallback((index) => branchChat(win, msgs, index), [win, msgs]);

  const sendArtifact = React.useCallback((artifact) => sendToCanvas(win.id, artifact), [win.id]);

  const selectModel = React.useCallback(async (provider, model) => {
    if (!agent || win.demoMode) return;
    const updated = { ...agent, model_provider: provider, model_name: model };
    setModelStatus(`Switching to ${model}…`);
    try {
      await api.saveAgent(updated);
      updateAgent(updated);
      setModelStatus(null);
    } catch (err) {
      setModelStatus(`Could not switch: ${err?.message || 'save failed'}`);
    }
  }, [agent, win.demoMode]);

  return { retry, branch, sendArtifact, selectModel, modelStatus };
}
