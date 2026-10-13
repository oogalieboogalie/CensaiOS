export const panelStyle = {
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  background: 'var(--surface)',
  border: '1px solid var(--hairline)',
  borderRadius: 'var(--radius-xl)',
  padding: 12,
  boxShadow: '0 12px 28px -24px oklch(0 0 0 / 0.35)',
};

export const sectionHeaderStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 10,
  fontFamily: 'var(--font-label)',
  fontSize: 'var(--text-xs)',
  fontWeight: 800,
  textTransform: 'var(--label-case)',
  letterSpacing: 'var(--label-tracking)',
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
  borderRadius: 'var(--radius-lg)',
  padding: '6px 8px',
  font: '13px/1.45 var(--font-sans)',
};

export const addInputStyle = {
  minWidth: 0,
  border: '1px solid var(--hairline)',
  outline: 'none',
  background: 'var(--surface-2)',
  color: 'var(--ink)',
  borderRadius: 'var(--radius-full)',
  padding: '8px 11px',
  font: '13px var(--font-sans)',
};

export const tagInputStyle = {
  minWidth: 0,
  border: '1px solid var(--hairline)',
  outline: 'none',
  background: 'var(--surface)',
  color: 'var(--ink)',
  borderRadius: 'var(--radius-lg)',
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
  borderRadius: 'var(--radius-lg)',
  padding: '7px 9px',
  font: '12px var(--font-sans)',
};

export const emptyAssigneeStyle = {
  width: 28,
  height: 28,
  borderRadius: 'var(--radius-lg)',
  border: '1px dashed var(--hairline-strong)',
  display: 'grid',
  placeItems: 'center',
  color: 'var(--ink-faint)',
  background: 'var(--surface)',
};

export const addButtonStyle = {
  all: 'unset',
  borderRadius: 'var(--radius-lg)',
  background: 'var(--accent)',
  color: 'var(--accent-contrast)',
  display: 'grid',
  placeItems: 'center',
};

export const iconButtonStyle = {
  all: 'unset',
  cursor: 'pointer',
  width: 20,
  height: 20,
  borderRadius: 'var(--radius-md)',
  display: 'grid',
  placeItems: 'center',
  color: 'var(--ink-faint)',
};
