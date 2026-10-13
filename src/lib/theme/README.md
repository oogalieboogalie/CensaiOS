# src/lib/theme/ — token derivation

## What this folder is

The canonical source of truth for **window-frame token derivation** — the
mapping that turns a mood's `--surface` (and accent) into the `--window-title-bg`
and `--window-shadow` values that every window header uses.

Previously, the header / shadow values were **hand-picked** in each mood entry
of `MOODS` in `src/components/Theme.jsx`. That meant when a user adjusted
`--surface` from the Fine Tune panel, the header and border did **not** follow
— the override was frozen. Brief A1 (`2026-06-23-a1-theme-token-cohesion.md`)
closes that gap by moving the derivation here.

## Files

- **`tokens.js`** — exports `computeTokenMap(preset, options?)` and
  `computeAllTokens(moodMap, options?)`. Pure JS, no new deps. OKLCH math
  reuses `parseOklch` / `oklch` / `clamp` from `src/components/Theme.jsx`.
- **`README.md`** — this file.

## Contract

`computeTokenMap(preset, options?)` takes a mood object (the output of the
`mood()` factory in `Theme.jsx`: `{ mode, accent, vars }`) and returns a
plain object of CSS variable overrides. The returned object only carries
the tokens this module owns:

- `--window-title-bg` — derived from `--surface` + accent and rendered as the subtle wash behind the compact title rail
- `--window-shadow`   — mode-tuned (dark vs light)

Everything else (`--surface`, `--ink`, `--bg`, `--window-strip-*`,
`--hairline`, etc.) is left to the mood's hand-picked values.

### How the derivation works

```
header_l  = clamp(surface_l + lift, 0, 1)         // small lift off surface
header_c  = max(surface_c * 0.55, floor)          // soften, never go grey
header_h  = mix(surface_h, accent_h, blend_weight) // nudge toward brand hue
header_bg = oklch(header_l, header_c, header_h)
```

`lift`, `floor`, and `blend_weight` are mode-tuned constants in `tokens.js`.
Dark moods lift more (`0.04`) than light moods (`0.02`) so the header reads
as "lit" against the card body without going white.

The shadow is a literal string per mode — a soft white inset plus an outer
drop whose opacity is stronger in dark mode and softer in light mode. This
is not derived from `--surface` because shadows are mostly black; deriving
them from the surface hue would produce noisy purple / green / blue shadows.

## Wire-up

`applyTheme(t)` in `src/components/Theme.jsx` calls `computeTokenMap(mood,
{ customVars: t.customVars })` after writing both `mood.vars` and
`customVars` to `:root`. The order matters:

1. `THEME_VAR_DEFAULTS` (initial state)
2. `mood.vars` (per-mood surface tokens)
3. `customVars` (live user edits from Fine Tune)
4. `computeTokenMap(...)` — derived header + shadow

So the derivation always reads the **effective** `--surface` (post-merge
with `customVars`) and writes the derived values on top. `customVars` can
still override the derived tokens explicitly — if a user wants a specific
header color that doesn't follow the surface, they can set
`customVars['--window-title-bg']` and it wins.

## Why pure JS

The brief's hard rule: **no new dependencies**. The math is OKLCH parsing
and string assembly — already in `Theme.jsx`. Pure JS also means the
function is trivially testable (see `tests/themeTokens.test.js`) and
works in both the browser and node test runners.

## What's NOT derived

The brief scoped the derivation to header / border / shadow. Per-mood
brand-strip overrides (`--window-strip-bg`, `--window-strip-height`)
stay declarative in `MOODS` because they're per-brand visual identity
(OpenAI's teal gradient, Google's multi-color stripe, etc.) and don't
have a "surface" to follow. A future brief (A2 — preset library
unification) is the right place to consider deriving the strip from the
mood's accent hue if we want full cohesion.

The hairline tokens (`--hairline`, `--hairline-strong`) are also kept
hand-picked per mood, because they encode a deliberate "subtle vs
strong" border weight that depends on the mood's overall contrast
budget, not just on the surface.

## Adding a new mood

If you add a new entry to `MOODS` in `src/components/Theme.jsx`, you do
**not** need to set `--window-title-bg` or `--window-shadow` — the
derivation will pick them up automatically from `--surface` and the
mood's `accent`. The test suite asserts every mood has a valid derived
title and shadow, so CI will catch missing fields.

If your new mood needs a specific header treatment that the derivation
can't produce (e.g. a translucent glass header), add a `--window-title-bg`
override to the mood — it will be set on `:root` first, then immediately
overwritten by the derivation. The clean answer is to add a feature flag
in `computeTokenMap` (`preset.glassHeader`, etc.) rather than a hardcoded
override; open a brief before doing that.
