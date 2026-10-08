/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { Icon } from '../Icons.jsx';

/**
 * Hover actions under a message (spec 3): copy, retry, branch, send to
 * canvas, and read aloud when the model can speak. Handlers that are not
 * passed are not shown.
 */
export function MessageActions({ copied, onCopy, onRetry, onBranch, onSendToCanvas, onSpeak, speaking, speakLoading, meta }) {
  return (
    <div className="hb-msg-actions" data-testid="message-actions">
      {onCopy && (
        <button type="button" className="hb-icon-btn" title={copied ? 'Copied' : 'Copy message'} aria-label={copied ? 'Copied' : 'Copy message'} onClick={onCopy}>
          {copied ? <Icon.Check size={13} /> : <Icon.Copy size={13} />}
        </button>
      )}
      {onRetry && (
        <button type="button" className="hb-icon-btn" title="Retry" aria-label="Retry" onClick={onRetry}>
          <Icon.Refresh size={13} />
        </button>
      )}
      {onBranch && (
        <button type="button" className="hb-icon-btn" title="Branch into a new chat" aria-label="Branch into a new chat" onClick={onBranch}>
          <Icon.Branch size={13} />
        </button>
      )}
      {onSendToCanvas && (
        <button type="button" className="hb-icon-btn" title="Send to canvas" aria-label="Send to canvas" onClick={onSendToCanvas}>
          <Icon.OpenWindow size={13} />
        </button>
      )}
      {onSpeak && (
        <button type="button" className="hb-icon-btn" aria-pressed={speaking}
          title={speaking ? 'Stop reading' : speakLoading ? 'Preparing audio…' : 'Read aloud'}
          aria-label={speaking ? 'Stop reading' : 'Read aloud'} disabled={speakLoading} onClick={onSpeak}>
          {speaking ? <Icon.Stop size={12} /> : <Icon.Speaker size={13} />}
        </button>
      )}
      {meta && <span className="hb-msg-actions-meta">{meta}</span>}
    </div>
  );
}
