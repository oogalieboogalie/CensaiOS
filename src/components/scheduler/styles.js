export const schedulerInputStyle = {
  width: '100%',
  padding: '7px 9px',
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--hairline)',
  background: 'var(--surface)',
  color: 'var(--ink)',
  fontSize: 'var(--text-xs)',
  outline: 'none'
};

export const addProjectToggleStyle = {
  all: 'unset',
  cursor: 'pointer',
  padding: '4px 8px',
  borderRadius: 'var(--radius-full)',
  fontSize: 'var(--text-xs)',
  fontWeight: 700,
  color: 'var(--ink-soft)',
  border: '1px solid var(--hairline)',
  background: 'var(--surface)'
};

export const addProjectToggleActiveStyle = {
  ...addProjectToggleStyle,
  color: 'var(--accent-ink)',
  border: '1px solid var(--accent)',
  background: 'var(--accent-soft)'
};
