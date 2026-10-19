import React from 'react';
import { buildErrorSnippet, fetchLogLines, plainWords, sendErrorToClaude } from '../lib/errorReport.js';

/**
 * A window's error, readable without knowing code: one plain line, a
 * "Details" fold with a short log snippet, and "Send to Claude", which opens a
 * chat with Censai that already has the snippet and asks it to look into it.
 *
 * `error` can be a string or an Error from apiError() (src/lib/errorReport.js).
 */
export function ErrorNote({ error, where = '', onDismiss }) {
  const [open, setOpen] = React.useState(false);
  const [sent, setSent] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  // The app's log around the error (GET /api/logs/recent), read when Details
  // opens. Send to Claude carries it then; without it the agent can still
  // read the log itself (read_app_log).
  const [logLines, setLogLines] = React.useState([]);
  React.useEffect(() => { setOpen(false); setSent(false); setCopied(false); setLogLines([]); }, [error]);
  React.useEffect(() => {
    if (!open || !error) return undefined;
    let live = true;
    fetchLogLines().then((found) => { if (live && found.length) setLogLines(found); });
    return () => { live = false; };
  }, [open, error]);
  const snippet = React.useMemo(() => (open ? buildErrorSnippet(error, { where, logLines }) : ''), [open, error, where, logLines]);
  if (!error) return null;

  const send = () => {
    sendErrorToClaude(error, { where, logLines });
    setSent(true);
  };
  const copy = () => {
    navigator.clipboard?.writeText(snippet || buildErrorSnippet(error, { where, logLines }))
      .then(() => setCopied(true), () => {});
  };

  return (
    <div className="hb-error-note" role="alert" data-testid="error-note">
      <div className="hb-error-note-line">{plainWords(error)}</div>
      <div className="hb-error-note-actions">
        <button type="button" className="hb-error-note-btn" aria-expanded={open} onClick={() => setOpen(v => !v)}>
          {open ? 'Hide details' : 'Details'}
        </button>
        <button type="button" className="hb-error-note-btn hb-error-note-send" onClick={send} disabled={sent}>
          {sent ? 'Sent to Claude' : 'Send to Claude'}
        </button>
        {onDismiss && <button type="button" className="hb-error-note-btn" onClick={onDismiss}>Dismiss</button>}
      </div>
      {open && (
        <div className="hb-error-note-details">
          <pre className="hb-error-note-log" data-testid="error-note-log">{snippet}</pre>
          <button type="button" className="hb-error-note-btn" onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
        </div>
      )}
    </div>
  );
}
