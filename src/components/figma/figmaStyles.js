export const inputStyle = {
  width: '100%', boxSizing: 'border-box', background: 'var(--surface-2)', border: '1px solid var(--hairline)',
  borderRadius: 'var(--radius-lg)', padding: '9px 11px', font: '13px var(--font-sans)', color: 'var(--ink)', outline: 'none',
};

export function primaryButton(enabled) {
  return {
    all: 'unset', boxSizing: 'border-box', cursor: enabled ? 'pointer' : 'not-allowed', padding: '9px 14px', borderRadius: 'var(--radius-lg)',
    background: 'var(--accent)', color: 'var(--accent-contrast, white)', font: '600 13px var(--font-sans)',
    textAlign: 'center', opacity: enabled ? 1 : 0.5,
  };
}

export const linkButton = {
  all: 'unset', cursor: 'pointer', font: '12px var(--font-sans)', color: 'var(--ink-soft)',
};
