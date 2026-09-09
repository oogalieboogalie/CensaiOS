export const schedulerInputStyle = {
  width: '100%',
  padding: '7px 9px',
  borderRadius: 7,
  border: '1px solid var(--hairline)',
  background: 'var(--surface)',
  color: 'var(--ink)',
  fontSize: 11,
  outline: 'none'
};

export const addProjectToggleStyle = {
  all: 'unset',
  cursor: 'pointer',
  padding: '4px 8px',
  borderRadius: 999,
  fontSize: 10,
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
