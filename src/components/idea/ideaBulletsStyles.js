export const panelStyle = {
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  background: 'var(--surface)',
  border: '1px solid var(--hairline)',
  borderRadius: 12,
  padding: 12,
  boxShadow: '0 12px 28px -24px oklch(0 0 0 / 0.35)',
};

export const sectionHeaderStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 10,
  fontFamily: 'var(--font-mono)',
  fontSize: 10,
  fontWeight: 800,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: 'var(--ink-faint)',
};

export const bulletInputStyle = {
  width: '100%',
  minHeight: 30,
  resize: 'vertical',
  border: '1px solid var(--hairline)',
  outline: 'none',
  background: 'var(--surface-2)',
  color: 'var(--ink)',
  borderRadius: 8,
  padding: '6px 8px',
  font: '13px/1.45 var(--font-sans)',
};

export const addInputStyle = {
  minWidth: 0,
  border: '1px solid var(--hairline)',
  outline: 'none',
  background: 'var(--surface-2)',
  color: 'var(--ink)',
  borderRadius: 999,
  padding: '8px 11px',
  font: '13px var(--font-sans)',
};

export const tagInputStyle = {
  minWidth: 0,
  border: '1px solid var(--hairline)',
  outline: 'none',
  background: 'var(--surface)',
  color: 'var(--ink)',
  borderRadius: 8,
  padding: '7px 9px',
  font: '12px var(--font-sans)',
};

export const assigneeSelectStyle = {
  minWidth: 0,
  width: '100%',
  border: '1px solid var(--hairline)',
  outline: 'none',
  background: 'var(--surface)',
  color: 'var(--ink)',
  borderRadius: 8,
  padding: '7px 9px',
  font: '12px var(--font-sans)',
};

export const emptyAssigneeStyle = {
  width: 28,
  height: 28,
  borderRadius: 8,
  border: '1px dashed var(--hairline-strong)',
  display: 'grid',
  placeItems: 'center',
  color: 'var(--ink-faint)',
  background: 'var(--surface)',
};

export const addButtonStyle = {
  all: 'unset',
  borderRadius: 10,
  background: 'var(--accent)',
  color: '#fff',
  display: 'grid',
  placeItems: 'center',
};

export const iconButtonStyle = {
  all: 'unset',
  cursor: 'pointer',
  width: 20,
  height: 20,
  borderRadius: 6,
  display: 'grid',
  placeItems: 'center',
  color: 'var(--ink-faint)',
};
