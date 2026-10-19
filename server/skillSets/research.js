// The research step: name a position, get a skill set. It follows Alex's
// Idea Foundry method: research what makes someone GREAT (not just good) at
// the position, then distill it into the professional skills an agent needs.
// Pure orchestration over injected deps:
//   search:   (query) -> [{ title, url, content }]   (optional, Tavily)
//   complete: (messages, opts) -> assistant text     (the person's own model key)

import { parseJsonBlock } from '../leadhound/prompts.js';
import { normalizeSkillSet, skillSetError } from './normalize.js';

const SNIPPET_CHARS = 700;
const MAX_SNIPPETS = 6;

export function researchQueries(position) {
  return [
    `what separates a great ${position} from a good one`,
    `habits and skills of the best ${position}s`,
  ];
}

export function skillSetMessages(position, snippets = []) {
  const research = snippets.length
    ? snippets.map((s, i) => `[${i + 1}] ${s.title} (${s.url})\n${s.content}`).join('\n\n')
    : 'No web results this time. Use what you know about the profession.';
  return [
    {
      role: 'system',
      content: [
        'You build skill sets for AI agents. A skill set is a granular list of skills that together "superpower" an agent for a position.',
        'Method: research what makes someone GREAT instead of just good at the position, reverse-engineer the mindset behind it, and distill it into the skills needed to do the job professionally.',
        'Each skill gets a short title and two or three sentences on what the best people actually do, written so an agent can act on it.',
        'Finish with one benchmark line in the form "The <Title> Benchmark: A good <role> ... A great <role> ...".',
        'Reply with JSON only: {"name": string, "position": string, "summary": string, "skills": [{"title": string, "detail": string}], "benchmark": string, "sources": [url strings you actually used]}.',
        'Give exactly 10 skills, most important first. No skill may repeat another.',
      ].join('\n'),
    },
    { role: 'user', content: `Position: ${position}\n\nResearch:\n${research}` },
  ];
}

/** Pure: the model's JSON (or something close) to a clean skill set. */
export function skillSetFromReply(reply, position, snippets = [], origin = 'research') {
  const parsed = parseJsonBlock(reply);
  if (!parsed || !Array.isArray(parsed.skills)) {
    throw skillSetError('The model did not send back a skill set. Try again, or pick another model.', 502);
  }
  const used = Array.isArray(parsed.sources) && parsed.sources.length ? parsed.sources : snippets.map((s) => s.url);
  return normalizeSkillSet({
    name: parsed.name || position,
    position: parsed.position || position,
    summary: parsed.summary,
    skills: parsed.skills,
    benchmark: parsed.benchmark,
    sources: used,
  }, { origin });
}

export async function researchSkillSet(rawPosition, { search = null, complete, onStep = () => {} }, { origin = 'research' } = {}) {
  const position = String(rawPosition || '').replace(/\s+/g, ' ').trim().slice(0, 120);
  if (!position) throw skillSetError('Name the position, for example "real estate agent".');
  let snippets = [];
  if (search) {
    onStep('searching');
    for (const query of researchQueries(position)) {
      try {
        const results = await search(query);
        for (const r of results || []) {
          if (snippets.length >= MAX_SNIPPETS || !r?.url || snippets.some((s) => s.url === r.url)) continue;
          snippets.push({ title: String(r.title || r.url).slice(0, 160), url: r.url, content: String(r.content || '').slice(0, SNIPPET_CHARS) });
        }
      } catch { /* research without the web rather than fail */ }
    }
  }
  onStep('distilling', { sources: snippets.length });
  const reply = await complete(skillSetMessages(position, snippets), { maxTokens: 2600, temperature: 0.4 });
  return skillSetFromReply(reply, position, snippets, origin);
}
