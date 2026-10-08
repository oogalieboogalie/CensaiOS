/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { WindowTitle } from './Windows.jsx';
import { Icon } from './Icons.jsx';
import { useChat } from './chat/useChat.js';
import { ChatBubble } from './chat/ChatBubble.jsx';
import { ChatInput } from './chat/ChatInput.jsx';
import { ChatEmptyState } from './chat/ChatEmptyState.jsx';
import { ModelChip } from './chat/ModelChip.jsx';
import { FreeAiAllowanceNotice } from './chat/FreeAiAllowanceNotice.jsx';
import { RelatedContext } from './doc/RelatedContext.jsx';
import { useWorkspaceStore } from '../lib/store.js';
import { agentHueStyle } from '../lib/chat/persona.js';

export function ChatWindow({ win, onUpdate, allWins, canvasGroups, currentProject, isActive, workspaceId }) {
  const activeWorkspaceId = useWorkspaceStore(state => state.workspaceId);
  const chat = useChat({ win, onUpdate, allWins, canvasGroups, currentProject, isActive });
  const { agent, msgs, sending, capabilities, speaker } = chat;
  const visible = msgs.filter(m => !m.hidden);
  const lastAgentIndex = msgs.reduce((last, m, i) => (m.from !== 'me' && !m.hidden ? i : last), -1);
  const provider = agent.model_provider || agent.modelProvider || null;

  return (
    <>
      <WindowTitle
        agent={agent}
        label={agent.name}
        subtitle={capabilities?.model || agent.role}
        attachedAgentIds={win.attachedAgents}
        onDetach={(id) => onUpdate({ attachedAgents: (win.attachedAgents || []).filter(a => a !== id) })}
        actions={msgs.length > 0 ? [{ id: 'new-chat', label: 'New chat', icon: <Icon.Plus size={13} />, onSelect: () => onUpdate({ msgs: [] }) }] : undefined}
      />
      <div className="hb-chat" data-chat-root data-agent-hue="" style={agentHueStyle(agent)}>
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
          speakerError={speaker.error}
          placeholder={`Message ${agent.name}`}
          modelChip={<ModelChip capabilities={capabilities} provider={provider} onSelect={win.demoMode ? undefined : chat.selectModel} status={chat.modelStatus} />}
        />
      </div>
    </>
  );
}
