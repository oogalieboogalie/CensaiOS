import React from 'react';

// Same shape as LeadHound's Tavily paste box. The key is a password field
// and is never written to the app log.
export function YouTubeKeyPrompt({ onSave, who = 'YouTube', note = '' }) {
  const [value, setValue] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState('');

  const save = async (event) => {
    event.preventDefault();
    if (!value.trim() || busy) return;
    setBusy(true);
    setMsg('');
    try {
      await onSave(value.trim());
      setValue('');
    } catch (err) {
      setMsg(err.message || 'Could not save the key');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={save} className="hb-lh-key" data-testid="youtube-key-prompt">
      <div>
        {note || `${who} searches with your own YouTube key. Paste it here. It is stored encrypted in your key vault, and Music Player, Stream Viewer and Shorts all use it.`}
      </div>
      <div className="hb-lh-key-row">
        <input
          className="hb-lh-input"
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="AIza…"
          aria-label="YouTube API key"
          autoComplete="off"
        />
        <button type="submit" className="hb-lh-pill" data-primary="true" disabled={!value.trim() || busy}>
          {busy ? 'Saving…' : 'Save key'}
        </button>
      </div>
      {msg && <div className="hb-lh-alert">{msg}</div>}
    </form>
  );
}
