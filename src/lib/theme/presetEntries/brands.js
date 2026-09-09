/**
 * src/lib/theme/presetEntries/brands.js
 *
 * Brand entries for PRESET_LIBRARY v0.1 (brief A2). Each value is an accent
 * preset: { label, accent: { hue, chroma, lightness } }.
 *
 * Migrated verbatim from the original `THEME_PRESETS` object in
 * `src/components/Theme.jsx`:
 *   - 8 generic accent swatches that were un-grouped at the top (moss … rust)
 *   - 19 platform / infra colorways (render … blender)
 *
 * Kept in a separate file from `presetLibrary.js` so the data table stays
 * within the 250-line size ratchet budget while preserving the single
 * source of truth.
 */
export const BRAND_ENTRIES = {
  // Un-grouped accent swatches (the original Theme.jsx header block)
  moss:    { label: 'Moss',    accent: { hue: 145, chroma: 0.11, lightness: 0.62 } },
  sage:    { label: 'Sage',    accent: { hue: 165, chroma: 0.08, lightness: 0.66 } },
  ocean:   { label: 'Ocean',   accent: { hue: 220, chroma: 0.13, lightness: 0.60 } },
  cobalt:  { label: 'Cobalt',  accent: { hue: 250, chroma: 0.15, lightness: 0.58 } },
  plum:    { label: 'Plum',    accent: { hue: 310, chroma: 0.12, lightness: 0.58 } },
  rose:    { label: 'Rose',    accent: { hue: 10,  chroma: 0.15, lightness: 0.64 } },
  amber:   { label: 'Amber',   accent: { hue: 65,  chroma: 0.14, lightness: 0.70 } },
  rust:    { label: 'Rust',    accent: { hue: 35,  chroma: 0.14, lightness: 0.62 } },
  // Platform / infra colorways (the original Theme.jsx "Platform / infra" group)
  render:     { label: 'Render',     accent: { hue: 165, chroma: 0.12, lightness: 0.70 } },
  vercel:     { label: 'Vercel',     accent: { hue: 250, chroma: 0.14, lightness: 0.60 } },
  envoy:      { label: 'Envoy',      accent: { hue: 350, chroma: 0.18, lightness: 0.62 } },
  kali:       { label: 'Kali',       accent: { hue: 245, chroma: 0.13, lightness: 0.60 } },
  arch:       { label: 'Arch',       accent: { hue: 235, chroma: 0.13, lightness: 0.62 } },
  jules:      { label: 'Jules',      accent: { hue: 290, chroma: 0.17, lightness: 0.62 } },
  cohere:     { label: 'Cohere',     accent: { hue: 268, chroma: 0.16, lightness: 0.58 } },
  github:     { label: 'GitHub',     accent: { hue: 250, chroma: 0.03, lightness: 0.58 } },
  gitlab:     { label: 'GitLab',     accent: { hue: 50,  chroma: 0.15, lightness: 0.66 } },
  docker:     { label: 'Docker',     accent: { hue: 245, chroma: 0.14, lightness: 0.62 } },
  kubernetes: { label: 'Kubernetes', accent: { hue: 258, chroma: 0.15, lightness: 0.58 } },
  terraform:  { label: 'Terraform',  accent: { hue: 295, chroma: 0.16, lightness: 0.56 } },
  netlify:    { label: 'Netlify',    accent: { hue: 185, chroma: 0.12, lightness: 0.70 } },
  railway:    { label: 'Railway',    accent: { hue: 285, chroma: 0.16, lightness: 0.62 } },
  flyio:      { label: 'Fly.io',     accent: { hue: 290, chroma: 0.15, lightness: 0.64 } },
  cloudflare: { label: 'Cloudflare', accent: { hue: 55,  chroma: 0.15, lightness: 0.68 } },
  figma:      { label: 'Figma',      accent: { hue: 35,  chroma: 0.16, lightness: 0.64 } },
  canva:      { label: 'Canva',      accent: { hue: 195, chroma: 0.13, lightness: 0.70 } },
  blender:    { label: 'Blender',    accent: { hue: 55,  chroma: 0.15, lightness: 0.67 } },
};