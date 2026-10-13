// Curated random theme combinations for the settings Randomize button.
// Pure: pass rand (default Math.random) and recent signatures; returns
// { patch, signature, scheme, mode }. Schemes rotate hue relationships so
// consecutive clicks land somewhere new instead of re-tinting one hue, and
// near-repeats of recent combos are skipped so click-through stays engaging.

const SCHEMES = ['mono', 'analogous', 'complementary', 'triadic', 'duotone'];
const SCHEME_CUTOFFS = [0.25, 0.5, 0.7, 0.85, 1.01];

export function pickScheme(rand) {
  const r = rand();
  return SCHEMES[SCHEME_CUTOFFS.findIndex((cut) => r < cut)];
}

export function shiftHue(hue, degrees) {
  return ((hue + degrees) % 360 + 360) % 360;
}

export function schemeAccentHue(scheme, baseHue, rand) {
  switch (scheme) {
    case 'analogous':
      return shiftHue(baseHue, rand() > 0.5 ? 30 : -30);
    case 'complementary':
      return shiftHue(baseHue, 180);
    case 'triadic':
      return shiftHue(baseHue, rand() > 0.5 ? 120 : 240);
    case 'duotone':
      return shiftHue(baseHue, 150 + Math.floor(rand() * 61));
    case 'mono':
    default:
      return baseHue;
  }
}

export function chromaBand(rand) {
  const r = rand();
  if (r < 0.25) return [0.05, 0.1];
  if (r < 0.7) return [0.14, 0.22];
  return [0.22, 0.3];
}

// Coarse signature: same mode + scheme + neighboring accent-hue bin.
export function signatureOf({ mode, scheme, accentHue }) {
  return `${mode}:${scheme}:${Math.round(accentHue / 15)}`;
}

export function isTooClose(signature, history) {
  if (!history || history.length === 0) return false;
  const [mode, scheme, bin] = signature.split(':');
  return history.some((entry) => {
    const [m, s, b] = entry.split(':');
    return m === mode && s === scheme && Math.abs(Number(b) - Number(bin)) <= 1;
  });
}

function surfaceVars(isDark, hue, rnd) {
  const vars = {};
  if (isDark) {
    vars['--bg'] = `oklch(${rnd(0.14, 0.20).toFixed(3)} ${rnd(0.005, 0.020).toFixed(3)} ${hue})`;
    vars['--canvas'] = `oklch(${rnd(0.11, 0.16).toFixed(3)} ${rnd(0.005, 0.020).toFixed(3)} ${hue})`;
    vars['--surface'] = `oklch(${rnd(0.19, 0.25).toFixed(3)} ${rnd(0.005, 0.020).toFixed(3)} ${hue})`;
    vars['--surface-2'] = `oklch(${rnd(0.16, 0.21).toFixed(3)} ${rnd(0.005, 0.015).toFixed(3)} ${hue})`;
    vars['--ink'] = `oklch(${rnd(0.90, 0.96).toFixed(3)} ${rnd(0.002, 0.010).toFixed(3)} ${hue})`;
    vars['--ink-soft'] = `oklch(${rnd(0.70, 0.78).toFixed(3)} ${rnd(0.004, 0.010).toFixed(3)} ${hue})`;
    vars['--hairline'] = `oklch(${rnd(0.28, 0.35).toFixed(3)} ${rnd(0.005, 0.015).toFixed(3)} ${hue})`;
    vars['--hairline-strong'] = `oklch(${rnd(0.38, 0.46).toFixed(3)} ${rnd(0.005, 0.015).toFixed(3)} ${hue})`;
  } else {
    vars['--bg'] = `oklch(${rnd(0.94, 0.98).toFixed(3)} ${rnd(0.005, 0.015).toFixed(3)} ${hue})`;
    vars['--canvas'] = `oklch(${rnd(0.92, 0.96).toFixed(3)} ${rnd(0.005, 0.018).toFixed(3)} ${hue})`;
    vars['--surface'] = `oklch(${rnd(0.97, 0.995).toFixed(3)} ${rnd(0.002, 0.010).toFixed(3)} ${hue})`;
    vars['--surface-2'] = `oklch(${rnd(0.93, 0.97).toFixed(3)} ${rnd(0.005, 0.015).toFixed(3)} ${hue})`;
    vars['--ink'] = `oklch(${rnd(0.18, 0.26).toFixed(3)} ${rnd(0.01, 0.03).toFixed(3)} ${hue})`;
    vars['--ink-soft'] = `oklch(${rnd(0.38, 0.46).toFixed(3)} ${rnd(0.008, 0.02).toFixed(3)} ${hue})`;
    vars['--hairline'] = `oklch(${rnd(0.83, 0.89).toFixed(3)} ${rnd(0.005, 0.015).toFixed(3)} ${hue})`;
    vars['--hairline-strong'] = `oklch(${rnd(0.70, 0.78).toFixed(3)} ${rnd(0.008, 0.02).toFixed(3)} ${hue})`;
  }
  return vars;
}

export function buildRandomThemeCombo(rand = Math.random, history = []) {
  const rnd = (min, max) => min + rand() * (max - min);
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const isDark = rand() > 0.5;
    const mode = isDark ? 'dark' : 'light';
    const scheme = pickScheme(rand);
    const baseHue = Math.floor(rand() * 360);
    const accentHue = Math.round(schemeAccentHue(scheme, baseHue, rand));
    const [chromaMin, chromaMax] = scheme === 'duotone' ? [0.2, 0.3] : chromaBand(rand);
    const accentChroma = Number(rnd(chromaMin, chromaMax).toFixed(3));
    const accentLightness = isDark
      ? Number(rnd(0.55, 0.78).toFixed(2))
      : Number(rnd(0.35, 0.6).toFixed(2));
    const signature = signatureOf({ mode, scheme, accentHue });
    if (attempt < 9 && isTooClose(signature, history)) continue;
    return {
      patch: {
        mood: isDark ? 'midnight' : 'cream',
        hue: accentHue,
        chroma: accentChroma,
        lightness: accentLightness,
        customVars: surfaceVars(isDark, baseHue, rnd),
      },
      signature,
      scheme,
      mode,
    };
  }
  return null;
}
