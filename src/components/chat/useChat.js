import React from 'react';
import { getAgents, getAgentById } from '../../lib/agentStore.js';
import { sendMessageWithMeta } from '../../lib/chat.js';
import { scriptedReply, replyDelayMs } from '../../data/landing-chat-script.js';
import { useVisibilityAwareInterval } from '../../lib/usePolling.js';
import { useWorkspaceStore } from '../../lib/store.js';

export function useChat({ win, onUpdate, allWins, canvasGroups, currentProject, isActive }) {
  const workspaceId = useWorkspaceStore(state => state.workspaceId);
  const agents = getAgents();
  const agent = getAgentById(win.agentId) || agents[1];
  const defaultMsgs = React.useMemo(() => [], [agent.id]);
  const msgs = win.msgs === undefined ? defaultMsgs : win.msgs;
  
  const setMsgs = (next) => onUpdate({ msgs: typeof next === 'function' ? next(msgs) : next });
  
  const [draft, setDraft] = React.useState('');
  const [sending, setSending] = React.useState(false);
  const [liveStatus, setLiveStatus] = React.useState({ status: 'thinking', detail: null });
  const [activityLog, setActivityLog] = React.useState([]);
  const [showAttach, setShowAttach] = React.useState(false);
  const [copiedMessage, setCopiedMessage] = React.useState(null);
  
  const scrollRef = React.useRef(null);
  
  React.useEffect(() => { 
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; 
  }, [msgs]);

  const copyMessage = React.useCallback(async (message, index) => {
    const text = String(message?.text || '');
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const area = document.createElement('textarea');
      area.value = text;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.focus();
      area.select();
      document.execCommand('copy');
      document.body.removeChild(area);
    }
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

  const send = React.useCallback(async (autoSendMessages = null) => {
    const isAuto = Array.isArray(autoSendMessages);
    if (isAuto) {
      if (sending) return;
    } else {
      if ((!draft.trim() && !win.imageAttachment) || sending) return;
    }

    const userMsg = isAuto ? null : { from: 'me', text: draft.trim(), image: win.imageAttachment };
    const displayMsgs = isAuto ? autoSendMessages : [...msgs, userMsg];

    if (!isAuto) {
      setMsgs(displayMsgs);
      setDraft('');
      if (win.imageAttachment) onUpdate({ imageAttachment: null });
    }

    if (win.demoMode) {
      if (isAuto) return;
      setSending(true);
      setTimeout(() => {
        setMsgs([...displayMsgs, { from: agent.id, text: scriptedReply(draft.trim()) }]);
        setSending(false);
      }, replyDelayMs());
      return;
    }

    const modelMsgs = displayMsgs.filter(m => !m.hidden);
    let payloadMsgs = [...modelMsgs];

    if (canvasGroups && allWins && payloadMsgs.length > 0) {
      const activeGroups = canvasGroups.filter(g => (g.attachedAgents || []).includes(agent.id));
      if (activeGroups.length > 0) {
        let groupContextText = '';
        activeGroups.forEach(g => {
          groupContextText += `\n\n--- IN GROUP: ${g.label} ---\n`;
          const inside = allWins.filter(w => {
            const cx = w.x + w.w / 2;
            const cy = w.y + w.h / 2;
            return cx >= g.x && cx <= g.x + g.w && cy >= g.y && cy <= g.y + g.h;
          });
          inside.forEach(w => {
            if (w.kind === 'doc' && w.text) groupContextText += `\n[Document Window]:\n${w.text}\n`;
            if (w.kind === 'todos' && w.items) groupContextText += `\n[Todo List Window]:\n${w.items.map(i => `${i.done?'[x]':'[ ]'} ${i.text}`).join('\n')}\n`;
            if (w.kind === 'files' && w.dirPath) groupContextText += `\n[Files Window (Local Directory)]: ${w.dirPath}\n`;
            if (w.kind === 'files' && w.githubRepo) groupContextText += `\n[Files Window (GitHub Repo)]: ${w.githubRepo}\n`;
          });
        });
        if (groupContextText.trim()) {
          const last = payloadMsgs.pop();
          payloadMsgs = [
            ...payloadMsgs,
            { 
              from: 'system', 
              text: `[VISUAL WORKSPACE CONTEXT] You are attached to these canvas groups and visible items:\n${groupContextText}\n\nThis visual context is not authorization. Use project tools only when the server-provided workspace membership permits the project.`
            },
            last
          ];
        }
      }
    }

    setSending(true);
    setLiveStatus({ status: 'thinking', detail: null });
    setActivityLog([]);

    try {
      const reply = await sendMessageWithMeta(agent.id, payloadMsgs, {
        windowId: win.id,
        workspaceId,
        currentProject,
        onStatusUpdate: (status, detail) => {
          setLiveStatus({ status, detail });
          if (status === 'completed_tool' && detail) {
            setActivityLog(log => [...log.slice(-39), detail]);
          }
        },
        onChangeImpact: impact => setLiveStatus({
          status: 'thinking',
          detail: { changeImpact: impact },
        }),
      });
      setMsgs([...displayMsgs, {
        from: agent.id,
        text: reply.text,
        activity: buildActivity(reply),
      }]);
    } catch (error) {
      setMsgs([...displayMsgs, {
        from: agent.id,
        text: error?.message || 'Something went wrong. Try again.',
        error: { code: error?.code, status: error?.status, retryAfter: error?.retryAfter },
      }]);
    }
    setSending(false);
  }, [msgs, draft, win.imageAttachment, win.demoMode, win.id, agent.id, workspaceId, currentProject, canvasGroups, allWins, onUpdate, setMsgs]);

  React.useEffect(() => {
    if (win.autoSend && msgs.length > 0 && msgs[msgs.length - 1].from === 'me' && !sending) {
      onUpdate({ autoSend: false });
      send(msgs);
    }
  }, [win.autoSend, msgs, sending, onUpdate, send]);

  return {
    agent,
    msgs,
    draft,
    setDraft,
    sending,
    liveStatus,
    activityLog,
    showAttach,
    setShowAttach,
    copiedMessage,
    scrollRef,
    copyMessage,
    send,
    imageAttachment: win.imageAttachment,
    onUpdate,
  };
}

function buildActivity(reply) {
  const timings = reply?.timings;
  const tools = reply?.tools || [];
  if (!timings && tools.length === 0) return null;
  return {
    totalMs: timings?.total_ms,
    modelMs: timings?.model_ms,
    setupMs: timings?.setup_ms,
    toolMs: timings?.tool_ms,
    rounds: timings?.model_calls?.length || 0,
    changeImpact: reply?.changeImpact || null,
    projectContext: reply?.projectContext || [],
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
