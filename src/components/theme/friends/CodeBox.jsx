import React from 'react';
import { copyText } from '../../../lib/friends/index.js';

const muted = { fontSize: 'var(--text-xs)', color: 'var(--ink-faint)', margin: 0, lineHeight: 1.5 };
const button = { border: '1px solid var(--hairline)', borderRadius: 'var(--radius-md)', padding: '7px 12px', background: 'var(--surface-2)', color: 'var(--ink)', fontSize: 'var(--text-sm)', fontWeight: 700, cursor: 'pointer', flexShrink: 0 };

/** A long code on one line that scrolls sideways, with a Copy button. */
export function CodeBox({ code, label, testId }) {
  const [copied, setCopied] = React.useState(false);
  React.useEffect(() => { setCopied(false); }, [code]);

  async function copy() {
    setCopied(await copyText(code));
  }

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
      <input
        readOnly
        value={code}
        aria-label={label}
        data-testid={testId}
        onFocus={(event) => event.target.select()}
        style={{
          flex: 1, minWidth: 0, border: '1px solid var(--hairline)', borderRadius: 'var(--radius-md)', padding: '7px 10px',
          background: 'var(--surface)', color: 'var(--ink-soft)', fontFamily: 'var(--font-mono, monospace)', fontSize: 'var(--text-xs)',
        }}
      />
      <button type="button" style={button} onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
    </div>
  );
}

export function Hint({ children, tone }) {
  return <p style={{ ...muted, color: tone === 'bad' ? 'var(--ps-red)' : tone === 'good' ? 'var(--success)' : muted.color }}>{children}</p>;
}
