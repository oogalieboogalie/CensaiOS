import React from 'react';

// A data box's own door (diagram 15): the GET and POST addresses other
// tools on the board can use to read the box and post to it. Same sign-in and
// workspace as the app, so nobody outside the workspace gets in.
export function SubAgentDoor({ door }) {
  const [open, setOpen] = React.useState(false);
  const [copied, setCopied] = React.useState('');
  if (!door) return null;

  const copy = async (label, text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
    } catch {
      setCopied('');
    }
  };

  const rows = [
    { label: 'GET', text: door.read, hint: 'Reads every note. Add &key=name for one note.' },
    { label: 'POST', text: door.post, hint: `Adds a note. Send JSON: ${door.body}` },
  ];

  return (
    <div className="hb-databox-door" data-testid="sub-agent-door">
      <button type="button" className="hb-databox-door-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        Door {open ? '▾' : '▸'}
      </button>
      {open && (
        <>
          {rows.map(row => (
            <div key={row.label} className="hb-databox-door-row">
              <span className="hb-databox-door-verb">{row.label}</span>
              <code title={row.hint}>{row.text}</code>
              <button type="button" className="hb-btn" onClick={() => copy(row.label, row.text)}>{copied === row.label ? 'Copied' : 'Copy'}</button>
            </div>
          ))}
          <p className="hb-databox-empty">Only people signed in to this workspace get through. POST body: {door.body}</p>
        </>
      )}
    </div>
  );
}
