/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { Icon } from '../Icons.jsx';
import { fileAcceptFor } from '../../lib/chat/modelCapabilities.js';
import { micSupported } from './useVoice.js';
import { AttachmentChip } from './AttachmentChip.jsx';
import { ModelChip } from './ModelChip.jsx';

const MIN_TEXTAREA_HEIGHT = 40;

/**
 * The composer (spec 3): an input that grows with your text up to a third of
 * the window, then a bar with attach controls (only the ones this model
 * accepts), the model chip, voice, and send, which turns into stop while the
 * reply streams. Paste or drop files anywhere on it.
 */
export function ChatInput({
  draft, setDraft,
  sending, send, onStop,
  imageAttachment, onUpdate,
  capabilities = null,
  attachments = [],
  attachError = null,
  clearAttachError,
  addFiles,
  removeAttachment,
  recorder = null,
  autoSpeak = false,
  setAutoSpeak,
  speakerError = null,
  modelChip,
  placeholder = 'Message',
  inputLabel = 'Message',
}) {
  const textareaRef = React.useRef(null);
  const imageInputRef = React.useRef(null);
  const fileInputRef = React.useRef(null);
  const videoInputRef = React.useRef(null);
  const [dragging, setDragging] = React.useState(false);
  const caps = capabilities || {};
  const canMic = Boolean(caps.voiceInput) && micSupported() && recorder;
  const processing = Boolean(recorder?.processing);
  const empty = !String(draft || '').trim() && attachments.length === 0 && !imageAttachment;
  const snapshotUnsupported = Boolean(imageAttachment) && capabilities && !caps.image;

  // Grow with the text, up to a third of the chat window.
  React.useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    const host = el.closest('[data-chat-root]');
    const max = Math.max(120, Math.round((host?.clientHeight || 600) / 3));
    el.style.height = 'auto';
    el.style.height = `${Math.max(MIN_TEXTAREA_HEIGHT, Math.min(el.scrollHeight, max))}px`;
    el.style.overflowY = el.scrollHeight > max ? 'auto' : 'hidden';
  }, [draft]);

  const handleKeyDown = (e) => {
    // Enter sends, Shift+Enter adds a line. Skip while an IME is composing so
    // Japanese, Chinese and Korean input can confirm a candidate with Enter.
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) {
      e.preventDefault();
      if (!sending) send();
    }
  };

  const pickFiles = (e) => {
    addFiles?.(e.target.files);
    e.target.value = '';
  };

  const handlePaste = (e) => {
    const files = Array.from(e.clipboardData?.files || []);
    if (files.length && addFiles) {
      e.preventDefault();
      addFiles(files);
    }
  };

  const handleDrop = (e) => {
    if (!e.dataTransfer?.files?.length || !addFiles) return;
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
    addFiles(e.dataTransfer.files);
  };

  const notice = attachError || speakerError
    || (snapshotUnsupported ? `${caps.model || 'This model'} can't read images. Remove the snapshot or switch the agent to a vision model.` : null);

  return (
    <div
      className="hb-composer"
      data-testid="chat-input"
      data-dragging={dragging ? 'true' : undefined}
      onDragOver={(e) => { if (addFiles && e.dataTransfer?.types?.includes?.('Files')) { e.preventDefault(); setDragging(true); } }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
    >
      {notice && (
        <div role="alert" className="hb-composer-notice">
          <span>{notice}</span>
          {(attachError && clearAttachError) && (
            <button type="button" className="hb-icon-btn" onClick={clearAttachError} aria-label="Dismiss"><Icon.Close size={11} /></button>
          )}
        </div>
      )}
      <div className="hb-composer-box">
        {(attachments.length > 0 || imageAttachment) && (
          <div className="hb-composer-tray">
            {attachments.map((a, i) => (
              <AttachmentChip key={`${a.name}-${i}`} attachment={a} onRemove={() => removeAttachment?.(i)} />
            ))}
            {imageAttachment && (
              <span style={{ position: 'relative', display: 'inline-flex' }}>
                <img src={imageAttachment} alt="Canvas snapshot" style={{ height: 'var(--space-12)', borderRadius: 'var(--radius-md)', border: '1px solid var(--hairline)' }} />
                <button type="button" className="hb-icon-btn" onClick={() => onUpdate?.({ imageAttachment: null })} aria-label="Remove attachment"
                  style={{ position: 'absolute', top: 0, right: 0, background: 'var(--surface)' }}>
                  <Icon.Close size={10} />
                </button>
              </span>
            )}
          </div>
        )}
        <textarea
          ref={textareaRef}
          className="hb-composer-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={recorder?.recording ? 'Listening… press stop when done' : processing ? 'Processing voice…' : placeholder}
          rows={1}
          aria-label={inputLabel}
        />
        <div className="hb-composer-bar">
          {addFiles && caps.image && (
            <ToolButton label="Attach image" onClick={() => imageInputRef.current?.click()}><Icon.Picture size={14} /></ToolButton>
          )}
          {addFiles && (
            <ToolButton label={caps.pdf ? 'Attach file (PDF or text)' : 'Attach text file'} onClick={() => fileInputRef.current?.click()}><Icon.Paperclip size={14} /></ToolButton>
          )}
          {addFiles && caps.video && (
            <ToolButton label="Attach video" onClick={() => videoInputRef.current?.click()}><Icon.Video size={14} /></ToolButton>
          )}
          {modelChip === undefined ? <ModelChip capabilities={capabilities} /> : modelChip}
          <span className="hb-composer-spacer" />
          {canMic && (
            <ToolButton
              label={recorder.recording ? 'Stop recording' : caps.voiceInput === 'native' ? 'Record voice message' : 'Dictate'}
              onClick={recorder.toggle} active={recorder.recording} disabled={processing}>
              {recorder.recording ? <Icon.Stop size={12} /> : <Icon.Mic size={14} />}
            </ToolButton>
          )}
          {caps.voiceOutput && setAutoSpeak && (
            <ToolButton label={autoSpeak ? 'Stop reading replies aloud' : 'Read replies aloud'} onClick={() => setAutoSpeak(!autoSpeak)} active={autoSpeak}>
              <Icon.Speaker size={14} />
            </ToolButton>
          )}
          {sending && onStop ? (
            <button type="button" className="hb-send-btn" data-stop="true" onClick={onStop} title="Stop" aria-label="Stop reply">
              <Icon.Stop size={11} />
            </button>
          ) : (
            <button type="button" className="hb-send-btn" onClick={() => send()} title="Send" aria-label="Send message"
              disabled={sending || processing || empty}>
              <Icon.Up size={14} />
            </button>
          )}
        </div>
      </div>
      <input ref={imageInputRef} type="file" accept="image/*" multiple hidden data-testid="chat-image-input" onChange={pickFiles} />
      <input ref={fileInputRef} type="file" accept={fileAcceptFor(caps)} multiple hidden data-testid="chat-file-input" onChange={pickFiles} />
      <input ref={videoInputRef} type="file" accept="video/*" hidden data-testid="chat-video-input" onChange={pickFiles} />
    </div>
  );
}

function ToolButton({ label, onClick, active = false, disabled = false, children }) {
  return (
    <button type="button" className="hb-icon-btn" onClick={onClick} title={label} aria-label={label}
      aria-pressed={active} disabled={disabled}>
      {children}
    </button>
  );
}
