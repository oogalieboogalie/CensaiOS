// Spec 7: fair-housing word check for listing copy.
//
// US fair housing rules (the Fair Housing Act and HUD's advertising guidance)
// forbid ads that state a preference for or against people by race, color,
// religion, sex, disability, familial status or national origin. Most
// slips are innocent phrases ("perfect for a young couple", "walking
// distance to the church"), so this flags them with a reason and a safer
// rewrite. It is a first pass for a human, not legal advice.
//
// Severity:
//   risk    describes the people the home is for (or against); rewrite it.
//   review  usually fine about the property, risky about people; read it.
//
// Shared by the Listing Writer window, the agents' fair_housing_check tool
// and the tests, so it stays plain JavaScript with no imports.

export const FAIR_HOUSING_RULES = Object.freeze([
  // Familial status
  { pattern: /\b(no|without)\s+(kids|children|child)\b/i, category: 'Familial status', severity: 'risk', reason: 'Excludes families with children.', suggestion: 'Describe the home, not who may live there.' },
  { pattern: /\badults?\s+only\b/i, category: 'Familial status', severity: 'risk', reason: 'Excludes families with children (unless a qualified 55+ community).', suggestion: 'Remove, or state the community is a qualified 55+ community.' },
  { pattern: /\b(perfect|ideal|great)\s+for\s+(a\s+)?(young\s+)?(couples?|singles?|newlyweds?|families|family|retirees|empty[\s-]nesters|bachelors?|students?)\b/i, category: 'Familial status', severity: 'risk', reason: 'Names the kind of household the home is for.', suggestion: 'Say what the space offers, e.g. "three bedrooms with a flexible bonus room".' },
  { pattern: /\b(family|kid)[\s-]friendly\b/i, category: 'Familial status', severity: 'review', reason: 'Can read as a preference for families.', suggestion: 'Name the feature instead, e.g. "fenced yard" or "near parks".' },
  { pattern: /\bempty[\s-]nesters?\b/i, category: 'Familial status', severity: 'risk', reason: 'Names a household type.', suggestion: 'Describe the layout, e.g. "single-level living".' },
  { pattern: /\b(bachelor|bachelorette)\s+pad\b/i, category: 'Sex / familial status', severity: 'risk', reason: 'Names a household type.', suggestion: 'Describe the space instead.' },
  // Age
  { pattern: /\b(mature|older|young)\s+(person|persons|people|adults?|individuals?|buyers?|tenants?|professionals?)\b/i, category: 'Age / familial status', severity: 'risk', reason: 'States a preferred age group.', suggestion: 'Remove the description of the buyer.' },
  // Sex
  { pattern: /\b(male|female|men|women|man|woman)\s+(only|preferred|roommate)\b/i, category: 'Sex', severity: 'risk', reason: 'States a preference by sex.', suggestion: 'Remove.' },
  { pattern: /\bmaster\s+(bedroom|bed|suite|bath|closet)\b/i, category: 'Style', severity: 'review', reason: 'Not a legal violation, but most MLSs and brokerages now prefer "primary".', suggestion: 'Use "primary bedroom" or "primary suite".' },
  // Religion
  { pattern: /\b(christian|catholic|jewish|muslim|hindu|buddhist|mormon)\s+(home|family|families|neighborhood|community|buyers?)\b/i, category: 'Religion', severity: 'risk', reason: 'States a religious preference.', suggestion: 'Remove.' },
  { pattern: /\b(near|close to|steps from|walk to|walking distance (?:to|from))\s+(the\s+)?(church|synagogue|mosque|temple|parish)\b/i, category: 'Religion', severity: 'review', reason: 'Naming a house of worship can read as steering by religion.', suggestion: 'Name it as a landmark only if you would name other landmarks, or drop it.' },
  { pattern: /\bkosher\b/i, category: 'Religion', severity: 'review', reason: 'Fine for a kitchen feature, risky about people.', suggestion: 'Describe the kitchen ("two sinks, two dishwashers").' },
  // Race, color, national origin
  { pattern: /\b(white|black|asian|hispanic|latino|latina|caucasian|african[\s-]american)\s+(neighborhood|area|community|family|families|buyers?|tenants?)\b/i, category: 'Race / national origin', severity: 'risk', reason: 'States a racial or ethnic preference.', suggestion: 'Remove.' },
  { pattern: /\b(ethnic|integrated|segregated|racially)\b/i, category: 'Race / national origin', severity: 'risk', reason: 'Describes the people in the area.', suggestion: 'Describe the property and amenities instead.' },
  { pattern: /\b(english[\s-]speaking|speaks? english|no\s+foreigners|citizens?\s+only|american[\s-]born)\b/i, category: 'National origin', severity: 'risk', reason: 'States a preference by national origin.', suggestion: 'Remove.' },
  { pattern: /\b(exclusive|restricted|private)\s+(neighborhood|community|area|enclave)\b/i, category: 'Steering', severity: 'review', reason: '"Exclusive" or "restricted" areas can read as code for who is welcome.', suggestion: 'Name the actual feature, e.g. "gated entry" or "quiet cul-de-sac".' },
  // Disability
  { pattern: /\b(no\s+wheelchairs?|able[\s-]bodied|must\s+be\s+able\s+to\s+climb|no\s+(handicapped|disabled))\b/i, category: 'Disability', severity: 'risk', reason: 'Excludes people with disabilities.', suggestion: 'Describe access as a fact, e.g. "second-floor unit, no elevator".' },
  { pattern: /\b(handicapped|crippled|wheelchair[\s-]bound|mentally\s+ill|retarded)\b/i, category: 'Disability', severity: 'risk', reason: 'Describes people by disability.', suggestion: 'Use "accessible" to describe features, e.g. "step-free entry".' },
  { pattern: /\b(no\s+section\s*8|no\s+vouchers?)\b/i, category: 'Source of income', severity: 'risk', reason: 'Illegal in many states and cities.', suggestion: 'Remove.' },
  // Steering words that describe residents or safety
  { pattern: /\bsafe\s+(neighborhood|area|community|street)\b/i, category: 'Steering', severity: 'review', reason: '"Safe" is subjective and can steer buyers by who lives nearby.', suggestion: 'State facts, e.g. "gated entry" or "on a low-traffic cul-de-sac".' },
  { pattern: /\b(traditional|desirable)\s+(neighborhood|area|community)\b/i, category: 'Steering', severity: 'review', reason: 'Can read as code for the people who live there.', suggestion: 'Describe the amenities instead.' },
]);

/**
 * Check listing text. Returns { ok, flags } where each flag is
 * { term, index, category, severity, reason, suggestion }, sorted by index.
 * `ok` is true when nothing at "risk" severity was found.
 */
export function checkFairHousing(text) {
  const source = String(text || '');
  const flags = [];
  for (const rule of FAIR_HOUSING_RULES) {
    const global = new RegExp(rule.pattern.source, rule.pattern.flags.includes('g') ? rule.pattern.flags : `${rule.pattern.flags}g`);
    let match;
    while ((match = global.exec(source))) {
      flags.push({
        term: match[0],
        index: match.index,
        category: rule.category,
        severity: rule.severity,
        reason: rule.reason,
        suggestion: rule.suggestion,
      });
      if (match[0].length === 0) global.lastIndex += 1;
    }
  }
  flags.sort((a, b) => a.index - b.index || b.term.length - a.term.length);
  // Overlapping hits (two rules on the same words) keep the longest one.
  const kept = [];
  for (const flag of flags) {
    const last = kept[kept.length - 1];
    if (last && flag.index < last.index + last.term.length) continue;
    kept.push(flag);
  }
  return { ok: !kept.some(f => f.severity === 'risk'), flags: kept };
}

/** Split text into plain and flagged runs for highlighting. */
export function fairHousingSegments(text, flags = checkFairHousing(text).flags) {
  const source = String(text || '');
  const segments = [];
  let at = 0;
  for (const flag of flags) {
    if (flag.index > at) segments.push({ text: source.slice(at, flag.index) });
    segments.push({ text: source.slice(flag.index, flag.index + flag.term.length), flag });
    at = flag.index + flag.term.length;
  }
  if (at < source.length) segments.push({ text: source.slice(at) });
  return segments;
}
