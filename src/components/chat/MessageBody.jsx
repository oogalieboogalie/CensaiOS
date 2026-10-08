/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { renderMarkdown, CodeBlock } from '../../lib/renderMarkdown.jsx';
import { Icon } from '../Icons.jsx';
import { ArtifactCard } from './ArtifactCard.jsx';
import { ARTIFACT_LINE_THRESHOLD, isLongReply, lineCount, titleFromText } from '../../lib/chat/artifacts.js';

function copyText(text) {
  navigator.clipboard?.writeText(text).catch(err => console.error('Failed to copy:', err));
}

// Images an agent links to: data URLs and our own paths show inline. Remote
// URLs wait for a click, so a reply can't phone home by embedding a pixel.
function isInlineSafe(src) {
  return /^data:image\//.test(src) || /^\/(?!\/)/.test(src);
}

function ChatImage({ src, alt, onSend }) {
  const [shown, setShown] = React.useState(isInlineSafe(src));
  if (!shown) {
    let host = 'the web';
    try { host = new URL(src).host; } catch { /* keep the generic label */ }
    return (
      <button type="button" className="hb-text-btn" onClick={() => setShown(true)} title={src}>
        <Icon.Picture size={12} />Show image from {host}
      </button>
    );
  }
  return (
    <span className="hb-inline-image">
      <img src={src} alt={alt || 'image'} />
      {onSend && (
        <span className="hb-inline-image-actions">
          <button type="button" className="hb-text-btn" onClick={() => onSend({ type: 'image', src, alt })}><Icon.OpenWindow size={12} />Open in Image</button>
          <button type="button" className="hb-text-btn" onClick={() => onSend({ type: 'sketch', src, alt })}><Icon.Edit size={12} />Send to Sketchpad</button>
        </span>
      )}
    </span>
  );
}

/**
 * Markdown for a chat reply (spec 3). Code blocks get a language label, copy
 * and "Open in Code Editor"; very long ones become artifact cards. Images get
 * "Open in Image" and "Send to Sketchpad". A whole reply past the artifact
 * threshold shows a faded preview plus a card that opens it as a document.
 */
export function MessageBody({ text, onSend, streaming = false }) {
  const [expanded, setExpanded] = React.useState(false);
  const long = !streaming && isLongReply(text);
  const renderCode = React.useCallback(({ code, lang }) => {
    if (!onSend) return null;
    const open = () => onSend({ type: 'code', code, lang });
    if (!streaming && lineCount(code) > ARTIFACT_LINE_THRESHOLD) {
      return (
        <ArtifactCard type="code" title={lang ? `${lang} code` : 'Code'} meta={`${lineCount(code)} lines`}
          actions={[{ label: 'Open in Code Editor', onClick: open, primary: true }, { label: 'Copy', onClick: () => copyText(code) }]} />
      );
    }
    return (
      <CodeBlock code={code} lang={lang} onCopyCode={copyText}
        extraActions={<button type="button" className="hb-text-btn" onClick={open} title="Open in Code Editor">Open in Code Editor</button>} />
    );
  }, [onSend, streaming]);
  const renderImage = React.useCallback(({ src, alt }) => <ChatImage src={src} alt={alt} onSend={onSend} />, [onSend]);
  const body = renderMarkdown(text, { compact: true, onCopyCode: copyText, renderCode, renderImage });

  if (!long) return body;
  const title = titleFromText(text);
  return (
    <>
      <div className={expanded ? undefined : 'hb-msg-fade'}>{body}</div>
      <ArtifactCard type="text" title={title} meta={`${lineCount(text)} lines`}
        actions={[
          onSend ? { label: 'Open as document', onClick: () => onSend({ type: 'text', text, title }), primary: true } : null,
          { label: expanded ? 'Show less' : 'Show here', onClick: () => setExpanded(e => !e) },
        ]} />
    </>
  );
}
