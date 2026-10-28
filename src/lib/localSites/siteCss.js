// Local Sites: the stylesheet for a site, built from its preset's colors and
// fonts. Phone first: one column, a call bar pinned to the bottom, then two
// columns for hours and the map on a wider screen.
import { sitePreset } from './presets.js';

export function siteCss(presetId) {
  const { palette: c, fonts, id } = sitePreset(presetId);
  const shout = id === 'tattoo';
  return `:root {
  --bg: ${c.bg}; --surface: ${c.surface}; --ink: ${c.ink}; --soft: ${c.soft};
  --accent: ${c.accent}; --accent-ink: ${c.accentInk}; --band: ${c.band};
  --head: '${fonts.head}', Georgia, serif; --body: '${fonts.body}', system-ui, sans-serif;
}
* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 17px/1.6 var(--body); }
a { color: var(--accent); }
h1, h2 { font-family: var(--head); line-height: 1.1; margin: 0 0 .5em;${shout ? ' letter-spacing: .03em; text-transform: uppercase;' : ''} }
h1 { font-size: clamp(2.4rem, 8vw, 4.5rem); }
h2 { font-size: clamp(1.6rem, 5vw, 2.4rem); }
main > section { padding: 56px max(20px, calc((100% - 960px) / 2)); }
.top { position: sticky; top: 0; z-index: 2; display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 14px max(20px, calc((100% - 960px) / 2)); background: var(--bg); border-bottom: 1px solid color-mix(in srgb, var(--ink) 12%, transparent); }
.brand { font-family: var(--head); font-weight: 700; font-size: 1.2rem; color: var(--ink); text-decoration: none; }
.top nav { display: flex; gap: 18px; }
.top nav a { color: var(--soft); text-decoration: none; font-size: .95rem; }
.top nav a:hover { color: var(--accent); }
.hero { padding-top: 88px !important; padding-bottom: 72px !important; }
.lead { font-size: 1.25rem; color: var(--soft); max-width: 36ch; margin: 0 0 28px; }
.actions { display: flex; flex-wrap: wrap; gap: 12px; }
.btn { display: inline-block; padding: 14px 22px; border-radius: 999px; border: 2px solid var(--accent); background: var(--accent); color: var(--accent-ink); font: 600 1rem var(--body); text-decoration: none; cursor: pointer; }
.btn.ghost { background: transparent; color: var(--accent); }
.about p { font-size: 1.15rem; max-width: 60ch; margin: 0; }
.band { background: var(--band); }
.items { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; max-width: 720px; }
.items li { display: flex; justify-content: space-between; gap: 16px; padding: 14px 0; border-bottom: 1px dashed color-mix(in srgb, var(--ink) 22%, transparent); }
.items b { color: var(--accent); white-space: nowrap; }
.gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(150px, 45%), 1fr)); gap: 12px; }
.about { padding-top: 0 !important; }
.gallery figure { margin: 0; background: var(--surface); border-radius: 14px; overflow: hidden; }
.gallery img { display: block; width: 100%; aspect-ratio: 4 / 3; object-fit: cover; }
.gallery figcaption { padding: 10px 14px; font-size: .9rem; color: var(--soft); }
.ticks { margin: 0; padding-left: 1.2em; max-width: 60ch; display: grid; gap: 8px; }
.ticks li::marker { color: var(--accent); }
.visit { display: grid; gap: 32px; }
.hours { border-collapse: collapse; width: 100%; max-width: 380px; }
.hours th, .hours td { text-align: left; padding: 8px 0; border-bottom: 1px solid color-mix(in srgb, var(--ink) 12%, transparent); }
.hours th { font-weight: 600; padding-right: 24px; }
.map { width: 100%; height: 280px; border: 0; border-radius: 14px; margin-top: 8px; background: var(--surface); }
.contact p { max-width: 60ch; }
.form { display: grid; gap: 14px; max-width: 520px; margin: 20px 0; }
.form label { display: grid; gap: 6px; font-weight: 600; font-size: .95rem; }
.form input, .form textarea { font: inherit; padding: 12px 14px; border-radius: 10px; border: 1px solid color-mix(in srgb, var(--ink) 25%, transparent); background: var(--surface); color: var(--ink); }
.form .btn { justify-self: start; }
.trap { display: none; }
.muted { color: var(--soft); }
.links { display: flex; flex-wrap: wrap; gap: 16px; }
.foot { padding: 28px 20px 96px; text-align: center; color: var(--soft); font-size: .9rem; }
.callbar { position: fixed; left: 16px; right: 16px; bottom: 16px; z-index: 3; padding: 16px; border-radius: 999px; text-align: center; background: var(--accent); color: var(--accent-ink); font-weight: 700; text-decoration: none; box-shadow: 0 8px 24px rgba(0, 0, 0, .25); }
@media (min-width: 760px) {
  .gallery { grid-template-columns: repeat(3, 1fr); gap: 16px; }
  .visit { grid-template-columns: 1fr 1.4fr; }
  .callbar { display: none; }
  .foot { padding-bottom: 28px; }
}
@media (max-width: 520px) { .top nav { display: none; } }
`;
}
