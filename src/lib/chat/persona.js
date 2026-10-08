// What a chat window shows before the first message (spec 3): the agent's
// one-line description and three starter prompts. Saved agents can carry
// their own in `description` / `starters` (or `identity.*`); the built-in
// team has defaults here; anyone else gets prompts built from their role.

const BUILT_IN = {
  architect: {
    blurb: 'Turns a goal into a plan, splits it into tasks and hands them to the right teammate.',
    starters: ['Break this project into milestones', 'Who on the team should own what?', 'Review my plan and find the gaps'],
  },
  censai: {
    blurb: 'Researches a topic, checks the sources and writes it up in plain language.',
    starters: ['Summarize what changed in AI this week', 'Find primary sources for a claim', 'Draft a newsletter intro'],
  },
  atlas: {
    blurb: 'Designs and debugs backend code: APIs, data flow, performance and tests.',
    starters: ['Review this API design', 'Why is this endpoint slow?', 'Write tests for a function'],
  },
  genesis: {
    blurb: 'Designs interfaces with the person using them in mind: layout, rhythm and flow.',
    starters: ['Critique this screen', 'Suggest a simpler onboarding flow', 'Name the states this view needs'],
  },
  nexus: {
    blurb: 'Looks after databases: schemas, migrations, queries and what can go wrong with them.',
    starters: ['Review this schema', 'Write a safe migration', 'Explain this slow query'],
  },
  foundation: {
    blurb: 'Builds and runs containers: Dockerfiles, compose stacks and Kubernetes.',
    starters: ['Write a Dockerfile for this app', 'Why is my container restarting?', 'Turn this into a compose file'],
  },
  echo: {
    blurb: 'Ties the work back to customers, revenue and risk.',
    starters: ['Who would pay for this?', 'Price this feature', 'What is the biggest risk this quarter?'],
  },
  phoenix: {
    blurb: 'Recovers lost work and stuck agents, and gets the team back on track.',
    starters: ['An agent stopped responding', 'Help me recover a lost file', 'What broke since yesterday?'],
  },
};

function cleanList(value) {
  if (!Array.isArray(value)) return [];
  return value.map(item => String(item || '').trim()).filter(Boolean);
}

function firstText(...values) {
  for (const value of values) {
    const text = typeof value === 'string' ? value.trim() : '';
    if (text) return text;
  }
  return '';
}

export function agentPersona(agent) {
  const id = agent?.id;
  const builtIn = BUILT_IN[id] || null;
  const identity = agent?.identity && typeof agent.identity === 'object' ? agent.identity : {};
  const role = firstText(agent?.role);
  const blurb = firstText(agent?.description, identity.description, agent?.tagline, builtIn?.blurb)
    || (role ? `Your ${role.toLowerCase()} teammate.` : 'Ask anything.');
  const saved = cleanList(agent?.starters).concat(cleanList(identity.starters), cleanList(agent?.starter_prompts));
  const starters = (saved.length ? saved : builtIn?.starters || [
    role ? `What can you help me with as ${role.toLowerCase()}?` : 'What can you help me with?',
    'Look at what is on my canvas and suggest a next step',
    'Explain your last answer more simply',
  ]).slice(0, 3);
  const hue = Number.isFinite(Number(agent?.hue)) ? Number(agent.hue) : null;
  return { name: agent?.name || 'Agent', blurb, starters, hue };
}

/** CSS custom properties that tint an element with the agent's accent (see tokens.css). */
export function agentHueStyle(agent) {
  const hue = Number(agent?.hue);
  return Number.isFinite(hue) ? { '--agent-h': hue } : undefined;
}
