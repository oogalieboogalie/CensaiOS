// Shared inline styles for the agent network tab. Theme variables only.

export const inputStyle = {
  width: '100%', boxSizing: 'border-box', padding: '7px 10px', borderRadius: 'var(--radius-md)',
  border: '1px solid var(--hairline)', background: 'var(--surface)',
  color: 'var(--ink)', fontSize: 'var(--text-sm)', fontFamily: 'inherit',
};

export function buttonStyle({ primary = false, disabled = false } = {}) {
  return {
    all: 'unset', cursor: disabled ? 'default' : 'pointer', padding: '5px 10px', borderRadius: 'var(--radius-md)',
    border: '1px solid var(--hairline)', fontSize: 'var(--text-xs)', fontWeight: 650,
    background: disabled ? 'var(--surface)' : primary ? 'var(--accent-soft)' : 'var(--surface-2)',
    color: disabled ? 'var(--ink-faint)' : primary ? 'var(--accent-ink)' : 'var(--ink)',
  };
}

export const rowStyle = {
  border: '1px solid var(--hairline)', borderRadius: 'var(--radius-lg)', background: 'var(--surface-2)',
  padding: 10, display: 'grid', gap: 6,
};

export const sectionLabel = {
  fontFamily: 'var(--font-label)', fontSize: 'var(--text-xs)', color: 'var(--ink-faint)',
  letterSpacing: 'var(--label-tracking)', textTransform: 'var(--label-case)',
};

const TONES = {
  good: { color: 'var(--accent-ink)', background: 'var(--accent-soft)' },
  warn: { color: 'var(--ink)', background: 'var(--surface-raised, var(--surface))' },
  bad: { color: 'var(--ps-red)', background: 'var(--surface)' },
  quiet: { color: 'var(--ink-faint)', background: 'var(--surface)' },
};

export function pillStyle(tone = 'quiet') {
  return {
    ...(TONES[tone] || TONES.quiet), padding: '2px 7px', borderRadius: 'var(--radius-full)',
    fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', letterSpacing: '0.04em', whiteSpace: 'nowrap',
  };
}

export const STATUS_TONE = Object.freeze({
  pending: 'warn', queued: 'warn', working: 'warn', completed: 'good',
  failed: 'bad', declined: 'bad', cancelled: 'quiet', unknown: 'quiet',
});
