export const MINDSET_SOURCE_REPORT = '2026-07-03-idea-foundry-mindsets-inventory.md';

function source(sourceFamily, issues) {
  return Object.freeze({ source: 'Idea-Foundry', sourceFamily, report: MINDSET_SOURCE_REPORT, issues });
}

export const REVIEWED_MINDSET_SOURCES = Object.freeze({
  mindset_strategic_foresight: source('CEO Mindset', [
    [272, 'Agent-Attribute: Strategic Foresight (CEO Mindset)', '76e21defee9101132cbb37a240421e62edc132d2292c96e543215b24a9240e13'],
    [276, 'Agent-Attribute: Strategic Foresight & Ownership (CEO Mindset)', '57cb156ccdbd644649442382cfbdd5875a79c8eef631fc2af8c680fc0e78d816'],
    [287, 'Agent Attribute: Strategic Foresight (CEO Mindset)', '71704f5afd47ebb7aa3f2cfe21cc9bc93631b775454fa8a24835e1e0be85cb94'],
    [327, 'Agent Attribute: Strategic Foresight (CEO Mindset)', '65cc6fb8ea36375806bbb79d0e682a7f3f3a04a9ec0463f0d5ada4d3a1401374'],
    [353, 'Agent-Attribute: Strategic Foresight (CEO Mindset)', 'aad66fe24afbcf092b37e96981f743298f349ba49ed5567658d75c2ae20148ee'],
    [383, 'Agent-Attribute: Strategic Foresight (CEO Mindset)', '60a21d6f7aab58221d8456e9ad96dd6be62f0e9a06777cb752af8ab17778a02a'],
  ]),
  mindset_adaptive_project_orchestration: source('Project Manager Mindset', [
    [252, 'Agent Attribute: Adaptive Project Orchestration (Project Manager Mindset)', '388141dd6ac980b02dbab57360b3d5c1fa4876aa233f8b4d9370ce536ce085dc'],
    [267, 'Agent Attribute: Adaptive Coordination (Project Manager Mindset)', 'a60b8101f87a33e61f1e8381fed88a8dab0ff113fa2e1f9f3a830543e5812675'],
    [271, 'Agent-Attribute: Decision Agility (Project Manager Mindset)', '655beaec4f193915af01b57d621b1f7251feec190c13c15d8d62c0f1a93ceffe'],
    [279, 'Agent-Attribute: Structured Execution & Adaptability (Project Manager Mindset)', 'd3d8fe7f2ea4cce9a847bd63e0d9668b80e7b58855fe234d2a82438fd998ba27'],
    [288, 'Agent Attribute: Orchestral Coordination (Project Manager Mindset)', '1da773aa4d254c124267a5fae759de5bc440075fcada32dfa9288a028f55acdd'],
    [292, 'Agent-Attribute: Strategic Foresight & Systematic Prioritization (Project Manager Mindset)', '681816abb1170c33000cda34393079809ea030d6b96ed56a099a7e1547e094df'],
    [328, 'Agent Attribute: Systematic Orchestration (Project Manager Mindset)', '4c9c93af7b2ccfcba480b6924709fc924503a193a78c7509e4fdb2c13097aec2'],
    [336, 'Agent-Attribute: Adaptive Project Orchestration Mindset', '4e13f6218c686a9a70a1ef2db91885e498231ef9cc5f4d4d563386eda573939e'],
  ]),
  mindset_client_centric_empathy: source('Financial Advisor Mindset', [
    [289, 'Agent Attribute: Client-Centric Empathy (Financial Advisor Mindset)', '36bbad1c92bf33838c3afe75fd215b31c9a9fcc223ab8a24c04ef62864ba236a'],
    [323, 'Agent Attribute: Client-Centric Empathy & Behavioral Coaching (Financial Advisor Mindset)', '70ce734da5b7cafd023046792d4f4357babb96259b56af96ef022fe6eda75bbb'],
    [355, 'Agent-Attribute: Client-Centric Empathy (Financial Advisor Mindset)', 'c14c772fc62d2be0545bcb0a32c378b9f13fc01d18dc9e89d53ac37232e42573'],
    [384, 'Agent-Attribute: Client-Centric Empathy (Financial Advisor Mindset)', '2b951e4d1afe6a0a7cde889c162d90fa4fb1a1e5b2dcce79ef99b63f3601289f'],
  ]),
  mindset_ooda_decision_agility: source('Military Commander Mindset', [
    [352, 'Agent-Attribute: OODA Loop Decision Agility (Military Commander Mindset)', '9a7428f9be2869578a3decf2197f1ac2f5a51678f474193c60703a4747b0601e'],
    [358, 'Agent-Attribute: OODA Loop Decision Agility (Military Commander Mindset) — Reverse Engineering Framework', '96968f732f028f0a2ef8c5675d221030630a54dd7224118813ab07eeaa125faa'],
    [389, 'Agent-Attribute: OODA Loop Decision Agility (Military Commander Mindset)', '7b438b72a460575bcca480caaee65b7d97e8c84a6151f99b2272fc5a79c9ed1c'],
    [401, 'Agent-Attribute: OODA Loop Decision Agility (Military Commander Mindset)', '5948e4ac51b94a243ff647fb90c302287394cb3e2c5ae88153d11b00e654da1b'],
  ]),
  mindset_first_principles_decomposition: source('Scientist / Software Engineer Mindset', [
    [333, 'Agent Attribute: First Principles Analysis (Data Scientist Mindset)', '2aae24baeb13cfcbd4f3247379a083a47929ee8a1a64a397bb5ef5a7fee0461d'],
    [359, 'Agent-Attribute: First Principles Decomposition (Scientist Mindset) — Reverse Engineering Framework', '6e066c27ef047041338d5aa527d67db3b648d6dd6192ac83c2b468cfea79d18a'],
    [403, 'Agent-Attribute: First-Principles Decomposition (Software Engineer Mindset)', 'c8e8b9c0e907f068f27ca705106d14d487142573d1ce9db0e0a10a44a0f58b50'],
    [412, 'Agent-Attribute: First-Principles Decomposition (Software Engineer Mindset)', '15d224b074453f13fb33e691cbde7df6ea66e727f3367bfa39b250b0273231cc'],
  ]),
  mindset_cognitive_empathy_strategic_patience: source('Diplomat Mindset', [
    [360, 'Agent-Attribute: Cognitive Empathy & Strategic Patience (Diplomat Mindset) — Reverse Engineering Framework', 'ca2413af64f5cb51b9e5d4e869e9876bedb7dbada38214b9aff557169daa6cbe'],
    [390, 'Agent-Attribute: Cognitive Empathy & Strategic Patience (Diplomat Mindset)', '798927ced2ae401c83fd1feab6900a8f2f26f453e270cd21a4869b89b81fc20f'],
    [410, 'Agent-Attribute: Cognitive Empathy & Strategic Patience (Diplomat Mindset)', '36b9598b784836fff9d47f2d02c64cc7b437107fee16d2ad6f935dd996340600'],
    [422, 'Agent-Attribute: Strategic Patience & Cultural Synthesis (Diplomat Mindset)', '57a01810ce7887c831c6ad98d12c8467bb909dd9378e1b5cd2902ae23ac909d4'],
  ]),
});

export const REVIEWED_MINDSET_IDS = Object.freeze(Object.keys(REVIEWED_MINDSET_SOURCES));

function validationObject(value) {
  if (value && typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return {}; }
}

export function isReviewedMindsetDefinition(row) {
  const expected = REVIEWED_MINDSET_SOURCES[row?.id];
  if (!expected || row?.type !== 'mindset') return false;
  const validation = validationObject(row.validation);
  const actualIssues = Array.isArray(validation.issues) ? validation.issues.map(Number) : [];
  return validation.source === expected.source
    && validation.source_family === expected.sourceFamily
    && validation.report === expected.report
    && JSON.stringify(actualIssues) === JSON.stringify(expected.issues.map(([number]) => number));
}

export function filterReviewedMindsets(rows) {
  return rows.filter(isReviewedMindsetDefinition);
}

export function reviewedMindsetIssueCount() {
  return Object.values(REVIEWED_MINDSET_SOURCES)
    .reduce((count, entry) => count + entry.issues.length, 0);
}
