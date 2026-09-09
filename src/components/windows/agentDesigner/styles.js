// Shared style constants for AgentDesignerWindow

export const shellStyle = { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', background: 'var(--surface)', color: 'var(--ink)', overflow: 'hidden' };
export const topBarStyle = { height: 52, flex: '0 0 auto', display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 14, padding: '0 16px', background: 'var(--surface-2)', borderBottom: '1px solid var(--hairline)' };
export const brandStyle = { display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 };
export const bodyStyle = { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' };
export const flowStyle = { position: 'relative', minHeight: 0, overflow: 'hidden', background: 'var(--bg)' };
export const flowGridStyle = { position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(circle, var(--hairline-strong) 1px, transparent 1px)', backgroundSize: '8px 8px', opacity: 0.35 };
export const detailsStyle = { display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0, minHeight: 0, overflowY: 'auto', padding: '24px 16px', background: 'var(--surface-2)' };
export const formContainerStyle = { maxWidth: 640, width: '100%', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 14 };
export const panelHeaderStyle = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 14, fontWeight: 800, color: 'var(--ink)' };
export const darkInputStyle = { width: '100%', boxSizing: 'border-box', border: '1px solid var(--hairline)', background: 'var(--surface)', borderRadius: 10, padding: '9px 11px', font: '13px/1.35 var(--font-sans)', color: 'var(--ink)', outline: 'none' };
export const primaryBtnStyle = { all: 'unset', justifySelf: 'end', cursor: 'pointer', padding: '9px 16px', borderRadius: 999, background: 'var(--accent)', color: 'white', fontSize: 12, fontWeight: 850, border: '1px solid var(--accent)' };
export const segmentedStyle = { display: 'flex', padding: 2, borderRadius: 999, border: '1px solid var(--hairline)', background: 'var(--surface)' };
export const segmentStyle = { all: 'unset', cursor: 'pointer', minWidth: 78, textAlign: 'center', padding: '7px 14px', borderRadius: 999, fontSize: 12, fontWeight: 850 };
export const sectionTitleStyle = { fontSize: 12, fontWeight: 850, color: 'var(--ink)', borderTop: '1px solid var(--hairline)', paddingTop: 10 };
export const chipBoxStyle = { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 7, minHeight: 66, padding: 10, borderRadius: 10, border: '1px solid var(--hairline)', background: 'var(--surface-2)' };
export const selectedChipStyle = { all: 'unset', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7, maxWidth: '100%', padding: '6px 8px', borderRadius: 8, background: 'var(--accent-soft)', color: 'var(--ink)', fontSize: 12, fontWeight: 750, border: '1px solid var(--accent)' };
export const toolSearchStyle = { flex: '1 1 150px', minWidth: 120, border: 0, outline: 0, background: 'transparent', color: 'var(--ink)', font: '13px var(--font-sans)' };
export const catalogStyle = { display: 'flex', flexDirection: 'column', gap: 12, maxHeight: 260, overflowY: 'auto', paddingRight: 3 };
export const categoryTitleStyle = { marginBottom: 6, fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-soft)', fontWeight: 850 };
export const toolGridStyle = { display: 'grid', gridTemplateColumns: '1fr', gap: 6 };
export const toolButtonStyle = { all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, padding: '8px 9px', borderRadius: 8, border: '1px solid var(--hairline)', color: 'var(--ink)', fontSize: 12, fontWeight: 750 };
export const scopeStyle = { display: 'flex', flexDirection: 'column', gap: 10, padding: 10, border: '1px solid var(--hairline)', borderRadius: 10, background: 'var(--surface-2)' };
export const listStyle = { display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 142, overflowY: 'auto', paddingRight: 2 };
export const nodeStyle = { position: 'absolute', width: 186, minHeight: 112, borderRadius: 11, overflow: 'hidden', background: 'var(--surface)', border: '1px solid var(--hairline)', boxShadow: 'var(--shadow-card)' };
export const nodeHeaderStyle = { display: 'flex', alignItems: 'center', gap: 7, padding: '9px 12px', color: 'var(--ink)', fontSize: 12, fontWeight: 850 };
export const nodeBodyStyle = { minHeight: 42, padding: '10px 12px', color: 'var(--ink)', fontSize: 11, fontWeight: 700, lineHeight: 1.35 };
export const nodeToolRowStyle = { display: 'flex', alignItems: 'center', gap: 5, padding: '0 12px 10px', minHeight: 20, fontSize: 10 };
export const canvasControlsStyle = { position: 'absolute', left: 14, bottom: 14, display: 'flex', flexDirection: 'column', gap: 6 };
export const miniBtnStyle = { all: 'unset', cursor: 'pointer', width: 30, height: 30, borderRadius: 8, display: 'grid', placeItems: 'center', background: 'var(--surface)', color: 'var(--ink)', border: '1px solid var(--hairline)', fontWeight: 850 };
export const connectorStyle = { position: 'absolute', left: '29%', right: '20%', top: '49%', height: 70, borderTop: '1px dashed var(--hairline-strong)', borderLeft: '1px dashed var(--hairline-strong)', borderRight: '1px dashed var(--hairline-strong)', borderRadius: '52% 52% 0 0', opacity: 0.7 };
export const parentBadgeStyle = { position: 'absolute', left: 16, top: 16, display: 'flex', alignItems: 'center', gap: 7, padding: '7px 9px', borderRadius: 999, background: 'var(--surface)', color: 'var(--ink)', border: '1px solid var(--hairline)', fontSize: 12, fontWeight: 800 };

export function dotStyle(category) {
  const hue = category === 'GitHub' ? 215 : category === 'Research' ? 20 : category === 'Project' ? 145 : category === 'Ops' ? 35 : category === 'Database' ? 280 : 190;
  return { width: 9, height: 9, borderRadius: 999, flex: '0 0 auto', background: `oklch(0.68 0.16 ${hue})` };
}

export function nodeToolDotStyle(category) {
  return { ...dotStyle(category), width: 18, height: 18, boxShadow: 'inset 0 0 0 4px var(--surface-2)' };
}
