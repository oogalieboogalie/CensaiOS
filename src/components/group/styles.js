// Shared style tokens for the Group window. The group accent system derives
// every color from the window's groupHue so re-tinting is a single update.

export const groupAccent = (groupHue) => `oklch(0.62 0.16 ${groupHue})`;
export const groupSoft = (groupHue) => `oklch(0.94 0.04 ${groupHue})`;

export const fieldStyle = { padding: '5px 8px', borderRadius: 6, border: '1px solid var(--hairline)', background: 'var(--surface)', font: '12px var(--font-sans)', color: 'var(--ink)', outline: 'none' };
export const smallSelectStyle = { padding: '4px 8px', borderRadius: 6, border: '1px solid var(--hairline)', background: 'var(--surface)', font: '11px var(--font-sans)', color: 'var(--ink)', outline: 'none' };
