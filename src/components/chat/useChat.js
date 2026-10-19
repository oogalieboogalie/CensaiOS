import React from 'react';
import { getAgents, getAgentById, subscribe as subscribeAgents } from '../../lib/agentStore.js';
import { sendMessageWithMeta } from '../../lib/chat.js';
import { scriptedReply, replyDelayMs } from '../../data/landing-chat-script.js';
import { useVisibilityAwareInterval } from '../../lib/usePolling.js';
import { useWorkspaceStore } from '../../lib/store.js';
import { messagesForSend, persistableMessage } from '../../lib/chat/attachments.js';
import { withGroupContext } from '../../lib/chat/groupContext.js';
import { withBoardKnowledge } from '../../lib/research/chatKnowledge.js';
import { copyToClipboard } from '../../lib/chat/clipboard.js';
import { useModelCapabilities } from './useModelCapabilities.js';
import { useSpeaker } from './useVoice.js';
import { useChatAttachments } from './useChatAttachments.js';
import { useChatActions } from './useChatActions.js';
import { useAutoPick } from './useAutoPick.js';
import { runEnded, runStarted, runTool, toolNameFrom } from '../../lib/weewoo/agentRun.js';

function useAgent(agentId) {
  // Re-render when the agent record changes (e.g. its model is switched).
  const agent = React.useSyncExternalStore(subscribeAgents, () => getAgentById(agentId), () => getAgentById(agentId));
  return agent || getAgents()[1];
}

export function useChat({ win, onUpdate, allWins, canvasGroups, currentProject, isActive, sendVia = null }) {
  const workspaceId = useWorkspaceStore(state => state.workspaceId);
  const agent = useAgent(win.agentId);
  const defaultMsgs = React.useMemo(() => [], [agent.id]);
  const msgs = win.msgs === undefined ? defaultMsgs : win.msgs;

  const setMsgs = (next) => onUpdate({ msgs: typeof next === 'function' ? next(msgs) : next });

  const [draft, setDraft] = React.useState('');
  const [sending, setSending] = React.useState(false);
  const [liveStatus, setLiveStatus] = React.useState({ status: 'thinking', detail: null });
  const [activityLog, setActivityLog] = React.useState([]);
  // Spec 3: the reply as it streams in. Lives in local state so the canvas
  // document only changes once, when the reply is complete.
  const [streamText, setStreamText] = React.useState('');
  const [copiedMessage, setCopiedMessage] = React.useState(null);
  const abortRef = React.useRef(null);
  const capabilities = useModelCapabilities(agent, { workspaceId, demoMode: win.demoMode });
  const chatAttachments = useChatAttachments({ capabilities, agentId: agent.id, workspaceId, setDraft });
  const { attachments, setAttachments, setAttachError } = chatAttachments;
  const speaker = useSpeaker(agent.id, { workspaceId });
  const autoPick = useAutoPick({ win, onUpdate, agent });

  const scrollRef = React.useRef(null);

  React.useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [msgs, streamText, activityLog.length]);

  React.useEffect(() => () => abortRef.current?.abort(), []);

  const copyMessage = React.useCallback(async (message, index) => {
    if (!(await copyToClipboard(message?.text))) return;
    setCopiedMessage(index);
    window.setTimeout(() => setCopiedMessage(current => current === index ? null : current), 1200);
  }, []);

  // Poll for local dev restarts
  const pollForRestarts = React.useCallback(async (cancelled = { val: false }) => {
    if (win.demoMode || !win.id || !agent.id) return;
    try {
      const params = new URLSearchParams({ windowId: win.id, agentId: agent.id });
      const res = await fetch(`/api/local-dev-restarts/notifications?${params}`);
      if (!res.ok) return;
      const notes = await res.json();
      if (cancelled.val || !Array.isArray(notes) || notes.length === 0) return;
      setMsgs(current => [
        ...current,
        ...notes.map(n => ({
          from: 'system',
          hidden: true,
          text: n.completion_message,
          localDevRestartId: n.id,
        })),
      ]);
    } catch {}
  }, [win.demoMode, win.id, agent.id]);

  React.useEffect(() => {
    const cancelled = { val: false };
    pollForRestarts(cancelled);
    return () => { cancelled.val = true; };
  }, [pollForRestarts]);

  useVisibilityAwareInterval(() => {
    pollForRestarts();
  }, 3000, { inactive: !isActive });

  const send = React.useCallback(async (autoSendMessages = null, textOverride = null) => {
    const isAuto = Array.isArray(autoSendMessages);
    const text = (textOverride ?? draft).trim();
    if (sending) return;
    if (!isAuto && !text && !win.imageAttachment && attachments.length === 0) return;

    const userMsg = isAuto ? null : { from: 'me', text, at: new Date().toISOString(), image: win.imageAttachment, ...(attachments.length ? { attachments } : {}) };
    const displayMsgs = isAuto ? autoSendMessages : [...msgs, userMsg];
    // Stored state keeps large attachments as name-only stubs; the request still carries their data.
    const storedMsgs = isAuto ? displayMsgs : [...msgs, persistableMessage(userMsg)];

    if (!isAuto) {
      setMsgs(storedMsgs);
      setDraft('');
      setAttachments([]);
      setAttachError(null);
      if (win.imageAttachment) onUpdate({ imageAttachment: null });
    }

    if (win.demoMode) {
      if (isAuto) return;
      setSending(true);
      setTimeout(() => {
        setMsgs([...storedMsgs, { from: agent.id, text: scriptedReply(text), at: new Date().toISOString() }]);
        setSending(false);
      }, replyDelayMs());
      return;
    }

    const grouped = withGroupContext(messagesForSend(displayMsgs.filter(m => !m.hidden)), canvasGroups, allWins, agent.id);
    const controller = new AbortController();
    abortRef.current = controller;
    let streamed = '';
    let streamRound = 0;
    const log = [];

    setSending(true);
    setLiveStatus({ status: 'thinking', detail: null });
    // Diagram 14: with Auto-pick on, switch to the model best at this task first.
    if (!isAuto) await autoPick.beforeSend(text);
    // WeeWoo: a small shared run record so everyone's office sees this
    // agent pick the task up, call tools and finish.
    let run = runStarted(win.agentRun, { prompt: isAuto ? displayMsgs[displayMsgs.length - 1]?.text : text });
    onUpdate({ agentRun: run });
    setActivityLog([]);
    setStreamText('');

    try {
      // Knowledge toggle: the board's saved research rides along, cited.
      const lastText = isAuto ? displayMsgs[displayMsgs.length - 1]?.text : text;
      const { msgs: payloadMsgs, sources } = await withBoardKnowledge(grouped, lastText, { enabled: Boolean(win.knowledge), workspaceId });
      // A Grok chat on the person's own Grok sign-in sends through it (useGrokSource).
      const reply = await (sendVia?.current || sendMessageWithMeta)(agent.id, payloadMsgs, {
        windowId: win.id,
        conversationId: win.chatId || `chat:${win.id}`,
        workspaceId,
        currentProject,
        signal: controller.signal,
        onDelta: (chunk, round) => {
          // A new model round starts a fresh answer; earlier text was preamble.
          if (round !== streamRound) { streamRound = round; streamed = ''; }
          streamed += chunk;
          setStreamText(streamed);
        },
        onStatusUpdate: (status, detail) => {
          setLiveStatus({ status, detail });
          if (status === 'calling_tool') {
            streamed = ''; setStreamText('');
            run = runTool(run, { tool: toolNameFrom(detail) });
            onUpdate({ agentRun: run });
          }
          if (status === 'completed_tool' && detail) {
            log.push(detail);
            setActivityLog(current => [...current.slice(-39), detail]);
          }
        },
        onChangeImpact: impact => setLiveStatus({ status: 'thinking', detail: { changeImpact: impact } }),
      });
      const nextMsgs = [...storedMsgs, { from: agent.id, text: reply.text, at: new Date().toISOString(), activity: buildActivity(reply), ...(sources.length ? { knowledge: sources } : {}) }];
      setMsgs(nextMsgs);
      onUpdate({ agentRun: runEnded(run, { state: 'done', text: reply.text }) });
      if (win.autoSpeak && capabilities.voiceOutput && reply.text) {
        speaker.speak(nextMsgs.length - 1, reply.text);
      }
    } catch (error) {
      onUpdate({ agentRun: runEnded(run, { state: error?.code === 'CHAT_ABORTED' ? 'stopped' : 'error', text: error?.code === 'CHAT_ABORTED' ? streamed : error?.message }) });
      if (error?.code === 'CHAT_ABORTED') {
        setMsgs([...storedMsgs, { from: agent.id, text: streamed || '(stopped before replying)', at: new Date().toISOString(), stopped: true, activity: buildActivity({ tools: log.map(toolFromEvent) }) }]);
      } else {
        setMsgs([...storedMsgs, {
          from: agent.id, at: new Date().toISOString(),
          text: error?.message || 'Something went wrong. Try again.',
          error: { code: error?.code, status: error?.status, retryAfter: error?.retryAfter, keyProvider: error?.details?.keyProvider || null },
        }]);
      }
    }
    if (abortRef.current === controller) abortRef.current = null;
    setStreamText('');
    setSending(false);
  }, [msgs, draft, attachments, sending, win.agentRun, win.imageAttachment, win.demoMode, win.autoSpeak, win.knowledge, win.id, win.chatId, agent.id, workspaceId, currentProject, canvasGroups, allWins, onUpdate, setMsgs, capabilities.voiceOutput, speaker, autoPick]);

  const stop = React.useCallback(() => abortRef.current?.abort(), []);

  React.useEffect(() => {
    if (win.autoSend && msgs.length > 0 && msgs[msgs.length - 1].from === 'me' && !sending) {
      onUpdate({ autoSend: false });
      send(msgs);
    }
  }, [win.autoSend, msgs, sending, onUpdate, send]);

  const actions = useChatActions({ win, agent, msgs, setMsgs, send, sending });

  return {
    agent, msgs, draft, setDraft, sending, stop, liveStatus, activityLog, streamText,
    copiedMessage, scrollRef, copyMessage, send,
    imageAttachment: win.imageAttachment,
    onUpdate,
    capabilities,
    ...chatAttachments,
    clearAttachError: () => setAttachError(null),
    speaker,
    autoSpeak: Boolean(win.autoSpeak),
    setAutoSpeak: (value) => onUpdate({ autoSpeak: Boolean(value) }),
    knowledge: Boolean(win.knowledge),
    setKnowledge: (value) => onUpdate({ knowledge: Boolean(value) }),
    autoPick,
    ...actions,
  };
}

function toolFromEvent(detail) {
  return { tool: detail.tool, ms: detail.ms, ok: detail.ok, summary: detail.summary };
}

function buildActivity(reply) {
  const timings = reply?.timings;
  const tools = reply?.tools || [];
  if (!timings && tools.length === 0 && !reply?.sevenContexts) return null;
  return {
    totalMs: timings?.total_ms,
    modelMs: timings?.model_ms,
    setupMs: timings?.setup_ms,
    toolMs: timings?.tool_ms,
    rounds: timings?.model_calls?.length || 0,
    changeImpact: reply?.changeImpact || null,
    projectContext: reply?.projectContext || [],
    sevenContexts: reply?.sevenContexts || null,
    tools: tools.map(t => ({
      name: t.tool,
      ms: t.ms,
      resultChars: t.result_chars,
      round: t.round,
      summary: t.summary,
      ok: t.ok,
    })),
  };
}
