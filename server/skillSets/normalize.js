// Pure: the shape every skill set takes, wherever it came from (a person's
// edit, the research step, the Idea Foundry, or a built-in).

export const SKILL_SET_ORIGINS = Object.freeze(['builtin', 'research', 'foundry', 'manual']);
export const SKILL_SET_LIMITS = Object.freeze({ skills: 15, title: 120, detail: 1200, name: 120, summary: 400, benchmark: 800, sources: 10 });

function text(value, max) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

export function skillSetError(message, statusCode = 400) {
  return Object.assign(new Error(message), { statusCode, code: 'SKILL_SET_INVALID' });
}

export function slugify(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}

export function normalizeSkill(skill) {
  if (typeof skill === 'string') {
    const [title, ...rest] = skill.split(/:\s+/);
    return normalizeSkill({ title, detail: rest.join(': ') });
  }
  const title = text(skill?.title ?? skill?.name, SKILL_SET_LIMITS.title).replace(/^\d+[.)]\s*/, '');
  const detail = text(skill?.detail ?? skill?.description, SKILL_SET_LIMITS.detail);
  return title ? { title, detail } : null;
}

export function normalizeSkillSet(input = {}, { origin } = {}) {
  const name = text(input.name, SKILL_SET_LIMITS.name);
  if (!name) throw skillSetError('Give the skill set a name.');
  const skills = (Array.isArray(input.skills) ? input.skills : [])
    .map(normalizeSkill).filter(Boolean).slice(0, SKILL_SET_LIMITS.skills);
  if (!skills.length) throw skillSetError('A skill set needs at least one skill.');
  const id = slugify(input.id) || slugify(name);
  if (!id) throw skillSetError('Give the skill set a name with letters or numbers in it.');
  const wanted = origin || input.origin;
  return {
    id,
    name,
    position: text(input.position, SKILL_SET_LIMITS.name),
    summary: text(input.summary, SKILL_SET_LIMITS.summary),
    skills,
    benchmark: text(input.benchmark, SKILL_SET_LIMITS.benchmark),
    origin: SKILL_SET_ORIGINS.includes(wanted) ? wanted : 'manual',
    sources: (Array.isArray(input.sources) ? input.sources : [])
      .map((source) => text(source, 300)).filter(Boolean).slice(0, SKILL_SET_LIMITS.sources),
  };
}

const LOG_LINES = 3;

/** Pure: the "## Skill sets" section of an agent's instructions. */
export function buildSkillSetsPrompt(sets = []) {
  if (!sets.length) return '';
  const lines = ['', '## Skill sets', 'You carry these skill sets. Work the way they describe; they are what makes someone great, not just good, at the job.'];
  for (const set of sets) {
    lines.push('', `### ${set.name}${set.position ? ` (${set.position})` : ''}`);
    set.skills.forEach((skill, index) => lines.push(`${index + 1}. ${skill.title}${skill.detail ? `: ${skill.detail}` : ''}`));
    if (set.benchmark) lines.push(set.benchmark);
    const log = Array.isArray(set.log) ? set.log.slice(0, LOG_LINES) : [];
    for (const entry of log) lines.push(`${entry.outcome === 'worked' ? 'Worked before' : 'Did not work before'}: ${entry.note}`);
  }
  lines.push('', 'When one of these skills clearly helped or clearly failed, note it with skill_set_log (worked or didnt, one plain sentence) so the set keeps getting better.');
  return lines.join('\n');
}
