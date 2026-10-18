/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';

// The board's "Do we have ..." phrases, one per line. Starting with one of
// these makes an agent look on the Blueprints shelf before it answers.
export function BlueprintPhrases({ phrases, defaults, onSave, busy }) {
  const [text, setText] = React.useState(phrases.join('\n'));
  React.useEffect(() => { setText(phrases.join('\n')); }, [phrases]);
  const lines = () => text.split('\n').map((l) => l.trim()).filter(Boolean);
  return (
    <div className="hb-bp-phrases">
      <p className="hb-bp-h">"Do we have" phrases</p>
      <p className="hb-bp-sub">When you start a question to any agent with one of these, it looks on this board's Blueprints shelf first and answers from what it finds. One phrase per line. The * means "and whatever comes after".</p>
      <textarea className="hb-bp-input hb-bp-text" rows={16} value={text} onChange={(e) => setText(e.target.value)} aria-label="Phrases, one per line" />
      <div className="hb-bp-actions">
        <button type="button" className="hb-bp-btn hb-bp-btn-primary" disabled={busy} onClick={() => onSave(lines())}>{busy ? 'Saving…' : 'Save phrases'}</button>
        <button type="button" className="hb-bp-btn" disabled={busy} onClick={() => onSave(defaults)}>Reset to the drawing's list</button>
      </div>
    </div>
  );
}
