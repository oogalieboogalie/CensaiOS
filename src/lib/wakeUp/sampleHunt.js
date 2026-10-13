// A finished LeadHound hunt for the board's first wake-up. Written by hand in
// the exact shape the real pipeline returns (server/leadhound/pipeline.js),
// so the LeadHound window shows it with no Tavily key and no model key. The
// business and every company in it are made up: the sites use the reserved
// .example domain and the phone numbers sit in the 555-01xx fiction range.

const BRIEF = {
  business: 'Bright Path Bookkeeping: monthly bookkeeping, payroll and quarterly tax prep for small trade businesses',
  market: 'Independent plumbing, heating and electrical contractors with 5 to 30 staff',
  region: 'Austin, Texas',
  maxLeads: 3,
};

const SENDER = 'Dana from Bright Path';

// Each lead carries the few facts the outreach is written around.
const LEADS = [
  {
    company: 'Lone Oak Plumbing Co.', host: 'lone-oak-plumbing.example', fitScore: 92,
    owner: 'Marisol', trade: 'plumbing', crew: 'fourteen plumbers',
    hook: 'you just opened a second shop in Round Rock',
    pain: 'two locations means two sets of books and payroll that has to land on time in both',
    why_fit: 'Family-owned, 14 staff, just opened a second location and is hiring. Two shops is the moment bookkeeping stops fitting in an evening.',
    pain_points: ['Payroll across two locations', 'Job costing by truck', 'Quarterly estimated taxes'],
    decision_maker: 'Marisol Vega, owner (runs the office side)',
    angle: 'Second-location growing pains: one set of clean books for both shops.',
    contacts: { emails: ['office@lone-oak-plumbing.example'], phones: ['(512) 555-0142'] },
  },
  {
    company: 'Barton Creek Heating & Air', host: 'barton-creek-hvac.example', fitScore: 86,
    owner: 'Terrence', trade: 'HVAC', crew: 'nine techs',
    hook: 'your summer service plans are booked solid',
    pain: 'maintenance plans bill monthly while parts are paid up front, so cash looks fine until it does not',
    why_fit: 'Sells monthly maintenance plans (recurring revenue) and posts about a busy season. Recurring billing plus seasonal swings is a bookkeeping job.',
    pain_points: ['Recurring plan billing', 'Seasonal cash swings', 'Parts and inventory costs'],
    decision_maker: 'Terrence Hall, co-owner',
    angle: 'Know your real margin per service plan before next summer.',
    contacts: { emails: ['hello@barton-creek-hvac.example'], phones: ['(512) 555-0187'] },
  },
  {
    company: 'Cedar Line Electric', host: 'cedar-line-electric.example', fitScore: 79,
    owner: 'Priya', trade: 'electrical', crew: 'seven electricians',
    hook: 'you added solar and EV charger installs this year',
    pain: 'new kinds of jobs bring new rebates, deposits and progress billing',
    why_fit: 'Small crew moving into solar and EV charger installs. New service lines bring rebates and progress billing that trip up small shops.',
    pain_points: ['Progress billing on larger jobs', 'Tracking rebates and credits'],
    decision_maker: 'Priya Raman, owner and master electrician',
    angle: 'Keep the new solar work profitable on paper, not just on the roof.',
    contacts: { emails: ['jobs@cedar-line-electric.example'], phones: ['(512) 555-0119'] },
  },
];

const RUNNERS_UP = [
  { company: 'Hill Country Drain Pros', host: 'hill-country-drain.example', fitScore: 64 },
  { company: 'Pecan Street HVAC', host: 'pecan-street-hvac.example', fitScore: 58 },
  { company: 'Riverside Sparks Electric', host: 'riverside-sparks.example', fitScore: 51 },
];

function sequenceFor(lead) {
  const { owner, trade, crew, hook, pain } = lead;
  return [
    { day: 1, channel: 'email', subject: `Congrats, ${owner}: ${hook.replace(/^you /, '')}`, body: `Hi ${owner},\n\nI saw ${hook}. Congratulations. Growth like that is usually the moment the books start eating evenings.\n\nI run Bright Path Bookkeeping. We only work with ${trade} and other trade shops in Austin, so we already know how your jobs, trucks and payroll fit together.\n\nWould a short call next week be useful?\n\n${SENDER}` },
    { day: 2, channel: 'linkedin', subject: '', body: `Hi ${owner}, I sent a note yesterday about the books for a ${crew} shop. Happy to connect here too. No pitch in this message, promise.` },
    { day: 3, channel: 'email', subject: 'The one number most trade shops never see', body: `Hi ${owner},\n\nMost ${trade} owners we meet know their revenue to the dollar but not their profit per job. The usual reason: ${pain}.\n\nWe set up job costing in the first month so every job shows what it really made. I made you a one-page sample of what that looks like (attached).\n\n${SENDER}` },
    { day: 4, channel: 'call', subject: '', body: `Short call to the office. Ask for ${owner}. If voicemail: "Hi ${owner}, it is Dana from Bright Path Bookkeeping. I sent over a one-page job-cost sample on Wednesday. No need to call back, I will send one last note on Friday."` },
    { day: 5, channel: 'email', subject: 'How a shop like yours got its Sundays back', body: `Hi ${owner},\n\nOne of our clients, a ${crew.split(' ')[0]}-person trade shop, used to close the books on Sunday nights. Now they get a two-page report on the 5th of every month and a text if anything looks off.\n\nIf that sounds good, the first month is free while we clean things up.\n\n${SENDER}` },
    { day: 6, channel: 'linkedin', subject: '', body: `${owner}, quick one: is bookkeeping something you handle yourself, or is there someone in the office I should talk to instead?` },
    { day: 7, channel: 'email', subject: 'Closing the loop', body: `Hi ${owner},\n\nI will stop here so I am not cluttering your inbox. If the books ever start eating your evenings, reply to this note and I will pick it up the same day.\n\nGood luck with everything, and congratulations again.\n\n${SENDER}` },
  ];
}

function iceBreakerFor(lead) {
  return {
    title: `${lead.company}: where the money goes, one page`,
    format: 'One-page PDF',
    opening_line: `${lead.owner}, I put together a one-page look at how a ${lead.crew} ${lead.trade} shop usually splits its money. No login, no strings.`,
    deliverable: [
      `## Where the money goes in a ${lead.trade} shop your size`,
      '',
      '| Every $100 billed | Typical | What we watch |',
      '| --- | --- | --- |',
      '| Labor and payroll taxes | $38 | Overtime creeping in during busy months |',
      '| Parts and materials | $24 | Parts bought for jobs that never got billed |',
      '| Trucks and fuel | $9 | Cost per truck, per job |',
      '| Office, insurance, software | $12 | Subscriptions nobody uses |',
      '| Profit before tax | $17 | The number to know every month |',
      '',
      `**Three things to check this week:** ${lead.pain_points.join('; ')}.`,
    ].join('\n'),
    cta: 'Want this filled in with your real numbers? Reply "yes" and we will do it free.',
  };
}

const leads = LEADS.map(({ owner, trade, crew, hook, pain, ...lead }, i) => ({
  ...lead,
  title: `${lead.company} | ${BRIEF.region}`,
  url: `https://${lead.host}/`,
  searchScore: 0.9 - i * 0.05,
  scoredBy: 'llm',
  sequence: sequenceFor({ owner, trade, crew, hook, pain }),
  iceBreaker: iceBreakerFor({ ...lead, owner, trade, crew, pain }),
}));

export const SAMPLE_HUNT = {
  sample: true,
  brief: BRIEF,
  queries: [
    'family-owned plumbing company Austin Texas hiring',
    'HVAC maintenance plan company Austin small business',
    'electrical contractor Austin solar EV charger install',
    'Austin trade contractor second location opening',
  ],
  idealProfile: 'Owner-run trade shops in Austin with 5 to 30 staff that are growing (new location, new service line or hiring), where the owner still does the books at night.',
  candidates: [
    ...leads.map(({ sequence, iceBreaker, contacts, ...rest }) => rest),
    ...RUNNERS_UP.map((c, i) => ({ ...c, title: c.company, url: `https://${c.host}/`, searchScore: 0.6 - i * 0.05, scoredBy: 'llm' })),
  ],
  leads,
  usage: { searches: 4, extracts: 3, llmCalls: 5 },
  warnings: ['Sample hunt: this business and these companies are made up, so you can see a finished hunt before adding any keys. Press New hunt to find real leads for your own business.'],
};
