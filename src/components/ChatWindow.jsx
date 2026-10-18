/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { WindowTitle } from './Windows.jsx';
import { Icon } from './Icons.jsx';
import { useChat } from './chat/useChat.js';
import { ChatBubble } from './chat/ChatBubble.jsx';
import { ChatInput } from './chat/ChatInput.jsx';
import { ChatEmptyState } from './chat/ChatEmptyState.jsx';
import { ModelChip } from './chat/ModelChip.jsx';
import { AutoPickNote } from './chat/AutoPickNote.jsx';
import { FreeAiAllowanceNotice } from './chat/FreeAiAllowanceNotice.jsx';
import { RelatedContext } from './doc/RelatedContext.jsx';
import { useWorkspaceStore } from '../lib/store.js';
import { agentHueStyle } from '../lib/chat/persona.js';
import { AgentEndpointPanel } from './agentEndpoints/AgentEndpointPanel.jsx';
import { OutsideToolsPanel } from './outsideTools/OutsideToolsPanel.jsx';
import { AgentMemoryPanel } from './agentMemory/AgentMemoryPanel.jsx';
import { AgentScoutPanel } from './agentScout/AgentScoutPanel.jsx';

export function ChatWindow({ win, onUpdate, allWins, canvasGroups, currentProject, isActive, workspaceId }) {
  const activeWorkspaceId = useWorkspaceStore(state => state.workspaceId);
  const chat = useChat({ win, onUpdate, allWins, canvasGroups, currentProject, isActive });
  const { agent, msgs, sending, capabilities, speaker } = chat;
  const visible = msgs.filter(m => !m.hidden);
  const lastAgentIndex = msgs.reduce((last, m, i) => (m.from !== 'me' && !m.hidden ? i : last), -1);
  const provider = agent.model_provider || agent.modelProvider || null;
  // One panel over the chat at a time: 'memory', 'scout', 'tools' (outside tools) or 'share' (Share agent).
  const [panel, setPanel] = React.useState(null);
  const sharing = panel === 'share';
  const toolsOpen = panel === 'tools';
  const memoryOpen = panel === 'memory';
  const scoutOpen = panel === 'scout';
  // Picking a model by hand overrides Auto-pick, so it turns off.
  const selectModel = (p, model) => {
    if (chat.autoPick.on) chat.autoPick.setAuto(false);
    chat.selectModel(p, model);
  };
  const togglePanel = (name) => setPanel((open) => (open === name ? null : name));
  const boardId = workspaceId ?? activeWorkspaceId;
  const canShare = Boolean(win.agentId && boardId && !win.demoMode);
  const actions = [
    canShare ? { id: 'agent-memory', label: 'Memory', title: `See what ${agent.name} remembers for you`, icon: <Icon.Memory size={13} />, pressed: memoryOpen, onSelect: () => togglePanel('memory') } : null,
    canShare ? { id: 'agent-scout', label: 'Scout', title: `${agent.name}'s scout: maps the code and points to the line to change`, icon: <Icon.Eye size={13} />, pressed: scoutOpen, onSelect: () => togglePanel('scout') } : null,
    canShare ? { id: 'agent-tools', label: 'Tools', title: `Give ${agent.name} tools from outside MCP servers`, icon: <Icon.Toolbox size={13} />, pressed: toolsOpen, onSelect: () => togglePanel('tools') } : null,
    canShare ? { id: 'share-agent', label: 'Share', title: `Let other apps ask ${agent.name}`, icon: <Icon.Plug size={13} />, pressed: sharing, onSelect: () => togglePanel('share') } : null,
    msgs.length > 0 ? { id: 'new-chat', label: 'New chat', icon: <Icon.Plus size={13} />, onSelect: () => onUpdate({ msgs: [], chatId: `chat:${win.id}:${Date.now()}` }) } : null,
  ].filter(Boolean);

  return (
    <>
      <WindowTitle
        agent={agent}
        label={agent.name}
        subtitle={capabilities?.model || agent.role}
        attachedAgentIds={win.attachedAgents}
        onDetach={(id) => onUpdate({ attachedAgents: (win.attachedAgents || []).filter(a => a !== id) })}
        actions={actions.length ? actions : undefined}
      />
      <div className="hb-chat" data-chat-root data-agent-hue="" style={agentHueStyle(agent)}>
        {sharing && canShare && (
          <AgentEndpointPanel agent={{ ...agent, id: win.agentId }} windowId={win.id} workspaceId={boardId} onClose={() => setPanel(null)} />
        )}
        {memoryOpen && canShare && (
          <AgentMemoryPanel agent={{ ...agent, id: win.agentId }} onClose={() => setPanel(null)} />
        )}
        {scoutOpen && canShare && (
          <AgentScoutPanel agent={{ ...agent, id: win.agentId }} workspaceId={boardId} onClose={() => setPanel(null)} />
        )}
        {toolsOpen && canShare && (
          <OutsideToolsPanel agent={{ ...agent, id: win.agentId }} onClose={() => setPanel(null)} />
        )}
        <div ref={chat.scrollRef} className="hb-chat-scroll">
          {visible.length === 0 && !sending ? (
            <ChatEmptyState agent={agent} model={capabilities?.model} onPick={(prompt) => chat.send(null, prompt)} />
          ) : (
            <div className="hb-chat-col">
              {msgs.map((m, i) => (
                <ChatBubble
                  key={i}
                  message={m}
                  index={i}
                  agent={m.from === 'me' ? null : agent}
                  isLast={i === lastAgentIndex && !sending}
                  copied={chat.copiedMessage === i}
                  onCopy={chat.copyMessage}
                  onRetry={sending ? undefined : chat.retry}
                  onBranch={chat.branch}
                  onSend={chat.sendArtifact}
                  onSpeak={capabilities.voiceOutput ? (message, index) => speaker.speak(index, message.text) : undefined}
                  speaking={speaker.playingKey === i}
                  speakLoading={speaker.loadingKey === i}
                />
              ))}
              {sending && (
                <ChatBubble
                  message={{ from: agent.id, text: chat.streamText }}
                  index={msgs.length}
                  agent={agent}
                  live={{ liveStatus: chat.liveStatus, activityLog: chat.activityLog }}
                />
              )}
              <RelatedContext workspaceId={workspaceId} query={msgs[msgs.length - 1]?.content || ''} />
            </div>
          )}
        </div>
        <FreeAiAllowanceNotice
          workspaceId={workspaceId ?? activeWorkspaceId}
          refreshKey={msgs.filter(message => message.from === 'agent').length}
        />
        <AutoPickNote pick={chat.autoPick.pick} onTurnOff={() => chat.autoPick.setAuto(false)} />
        <ChatInput
          draft={chat.draft}
          setDraft={chat.setDraft}
          sending={sending}
          send={chat.send}
          onStop={chat.stop}
          imageAttachment={chat.imageAttachment}
          onUpdate={onUpdate}
          capabilities={capabilities}
          attachments={chat.attachments}
          attachError={chat.attachError || chat.modelStatus}
          clearAttachError={chat.attachError ? chat.clearAttachError : undefined}
          addFiles={chat.addFiles}
          removeAttachment={chat.removeAttachment}
          recorder={chat.recorder}
          autoSpeak={chat.autoSpeak}
          setAutoSpeak={chat.setAutoSpeak}
          knowledge={win.demoMode ? null : { on: chat.knowledge, toggle: chat.setKnowledge }}
          speakerError={speaker.error}
          placeholder={`Message ${agent.name}`}
          modelChip={<ModelChip capabilities={capabilities} provider={provider} onSelect={win.demoMode ? undefined : selectModel} status={chat.modelStatus}
            auto={win.demoMode ? undefined : { on: chat.autoPick.on, toggle: chat.autoPick.setAuto }} />}
        />
      </div>
    </>
  );
}
