/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { AgentAvatar } from '../Agents.jsx';
import { AttachmentChip } from './AttachmentChip.jsx';
import { ChangeImpactBreadcrumbs } from './ChangeImpactBreadcrumbs.jsx';
import { ChatStatus } from './ChatStatus.jsx';
import { MessageActions } from './MessageActions.jsx';
import { MessageBody } from './MessageBody.jsx';
import { ArtifactCard } from './ArtifactCard.jsx';
import { ToolCallList, toolsFromActivity } from './ToolCallCard.jsx';
import { formatMs } from './toolActivity.js';
import { fileArtifacts, titleFromText } from '../../lib/chat/artifacts.js';
import { agentHueStyle } from '../../lib/chat/persona.js';

/**
 * One chat message (spec 3), shared by Chat, Group Chat and Ollama.
 *
 * The person's messages sit in a light bubble on the right. Agent replies are
 * unbubbled text at reading width, with tool calls as cards above the text,
 * big outputs as artifact cards, and hover actions underneath. Handlers that
 * are not passed hide their action.
 *
 *   agent       who wrote it (avatar, name and accent); showAuthor draws the row
 *   live        { liveStatus, activityLog } while the reply is still coming
 *   onSend      (artifact) => opens it as a window on the canvas
 */
export function ChatBubble({
  message: m, index, copied, onCopy, onSpeak, speaking = false, speakLoading = false,
  agent = null, showAuthor = false, authorMeta = null, isLast = false, live = null,
  onRetry, onBranch, onSend,
}) {
  const text = String(m.text || '');
  const canCopy = !m.hidden && text.length > 0 && !live;

  if (m.hidden || m.from === 'system') {
    return <div className="hb-msg-note" role="note">{text}</div>;
  }

  if (m.from === 'me') {
    return (
      <div className="hb-msg" data-from="me">
        <div className="hb-msg-bubble">
          {m.image && <img src={m.image} alt="attached" style={{ width: '100%', borderRadius: 'var(--radius-md)', border: '1px solid var(--hairline)' }} />}
          <MessageAttachments attachments={m.attachments} />
          {text && <div style={{ minWidth: 0 }}>{text}</div>}
        </div>
        <MessageActions
          copied={copied}
          onCopy={canCopy && onCopy ? () => onCopy(m, index) : undefined}
          onRetry={onRetry ? () => onRetry(index) : undefined}
          onBranch={onBranch ? () => onBranch(index) : undefined}
        />
      </div>
    );
  }

  const tools = toolsFromActivity(m.activity);
  const files = fileArtifacts(m.activity);
  const streaming = Boolean(live);
  const meta = [
    m.stopped ? 'Stopped' : null,
    Number.isFinite(m.activity?.totalMs) ? formatMs(m.activity.totalMs) : null,
    m.activity?.projectContext?.[0]?.projectName ? `${m.activity.projectContext[0].projectName} context` : null,
  ].filter(Boolean).join(' · ');

  return (
    <div className="hb-msg" data-from="agent" data-last={isLast ? 'true' : undefined}
      data-agent-hue={agent ? '' : undefined} style={agentHueStyle(agent)}>
      {showAuthor && agent && (
        <div className="hb-msg-author">
          <AgentAvatar agent={agent} size={18} />
          <span>{agent.name}</span>
          {authorMeta && <span className="hb-msg-author-meta">{authorMeta}</span>}
        </div>
      )}
      {live
        ? <ChatStatus liveStatus={live.liveStatus} activityLog={live.activityLog} streaming={text.length > 0} />
        : <ToolCallList tools={tools} />}
      <ChangeImpact impact={m.activity?.changeImpact} />
      {m.image && <img src={m.image} alt="attached" style={{ maxWidth: '100%', borderRadius: 'var(--radius-md)', border: '1px solid var(--hairline)' }} />}
      <MessageAttachments attachments={m.attachments} />
      {(text || streaming) && (
        <div className="hb-msg-body" data-error={m.error ? 'true' : undefined}>
          {/* While streaming, a block caret rides the end of the last line. */}
          {text && <MessageBody text={streaming ? `${text}\u258D` : text} onSend={onSend} streaming={streaming} />}
        </div>
      )}
      {files.map(f => (
        <ArtifactCard key={f.path} type="file" title={f.name}
          meta={[f.repo || f.path, f.added ? `+${f.added} lines` : null].filter(Boolean).join(' · ')}
          actions={[f.openable && onSend ? { label: 'Open', onClick: () => onSend(f), primary: true } : null]} />
      ))}
      {!streaming && (
        <MessageActions
          copied={copied}
          onCopy={canCopy && onCopy ? () => onCopy(m, index) : undefined}
          onRetry={onRetry ? () => onRetry(index) : undefined}
          onBranch={onBranch ? () => onBranch(index) : undefined}
          onSendToCanvas={canCopy && onSend ? () => onSend({ type: 'text', text, title: titleFromText(text, agent?.name ? `${agent.name} reply` : 'Reply') }) : undefined}
          onSpeak={canCopy && onSpeak ? () => onSpeak(m, index) : undefined}
          speaking={speaking}
          speakLoading={speakLoading}
          meta={meta}
        />
      )}
    </div>
  );
}

/** The change-impact receipt, folded behind one line until asked for. */
function ChangeImpact({ impact }) {
  const [open, setOpen] = React.useState(false);
  if (!impact?.breadcrumbs?.length) return null;
  return (
    <div>
      <button type="button" className="hb-text-btn" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        Change impact · {impact.risk} risk
      </button>
      {open && <ChangeImpactBreadcrumbs impact={impact} />}
    </div>
  );
}

function MessageAttachments({ attachments }) {
  if (!Array.isArray(attachments) || attachments.length === 0) return null;
  return (
    <div className="hb-msg-media">
      {attachments.map((a, i) => {
        if (a?.kind === 'image' && a.dataUrl) return <img key={i} src={a.dataUrl} alt={a.name || 'attached image'} />;
        if (a?.kind === 'audio' && a.dataUrl) return <audio key={i} controls src={a.dataUrl} aria-label={a.name || 'voice message'} />;
        if (a?.kind === 'video' && a.dataUrl) return <video key={i} controls src={a.dataUrl} aria-label={a.name || 'video'} />;
        return <AttachmentChip key={i} attachment={a || {}} />;
      })}
    </div>
  );
}
