// Stand-in Tavily and model for LeadHound tests and demos. The container has
// no Tavily or model key, so this serves believable search results for one
// brief (AI receptionists for small dental practices) and answers each of
// the three LeadHound prompts with the JSON shape a real model returns.

import http from 'node:http';

export const STANDIN_BRIEF = {
  business: 'We build AI receptionists that answer every call, text back missed callers and book appointments straight into the practice calendar.',
  market: 'Independent dental practices with 2 to 6 chairs',
  region: 'Austin, TX',
  maxLeads: 3,
};

const PRACTICES = [
  {
    url: 'https://www.barton-creek-family-dental.example/',
    title: 'Barton Creek Family Dental | Family Dentist in Austin, TX',
    content: 'Family dentistry with 4 chairs off Bee Caves Rd. New patients welcome. Call us during office hours, Mon-Thu 8-5. After hours please leave a voicemail and we will return your call the next business day. Book online coming soon.',
    contact: 'Contact us: frontdesk@barton-creek-family-dental.example · (512) 555-0142 · linkedin.com/company/barton-creek-family-dental Office manager: Dana Whitfield',
    company: 'Barton Creek Family Dental', fit: 94, maker: 'Office manager (Dana Whitfield)',
    why: 'Four chairs, no online booking yet, and after-hours calls go to voicemail until the next business day.',
    pains: ['After-hours calls go to voicemail', 'No online booking yet', 'Small front desk covering phones and check-in'],
    angle: 'Their site says after-hours callers wait until the next business day for a call back.',
  },
  {
    url: 'https://mueller-smiles.example/',
    title: 'Mueller Smiles - Cosmetic and General Dentistry, Austin',
    content: 'Two-dentist practice in the Mueller neighborhood. Now hiring: front desk coordinator (phones, scheduling, insurance verification). Same-week appointments for new patients.',
    contact: 'hello@mueller-smiles.example (512) 555-0187 instagram.com/muellersmiles',
    company: 'Mueller Smiles', fit: 88, maker: 'Practice owner (Dr. Priya Raman)',
    why: 'Hiring a front desk coordinator to cover phones and scheduling, a sign the phones are already stretched.',
    pains: ['Open front desk role', 'Promises same-week new patient visits', 'Insurance checks compete with the phone'],
    angle: 'Their open front desk listing puts phones and scheduling first.',
  },
  {
    url: 'https://eastside-dental-studio.example/',
    title: 'Eastside Dental Studio | Austin Dentist on East 6th',
    content: 'A modern 3-chair studio. Text us to book! Evening hours Tuesday and Thursday. Reviews: "Great care, but hard to get someone on the phone at lunch."',
    contact: 'book@eastside-dental-studio.example (512) 555-0119',
    company: 'Eastside Dental Studio', fit: 81, maker: 'Studio manager',
    why: 'Three chairs and evening hours, and reviews mention nobody answering the phone at lunch.',
    pains: ['Lunch-hour calls unanswered', 'Booking by text handled by hand'],
    angle: 'A recent review says it is hard to reach anyone at lunch.',
  },
  {
    url: 'https://www.hydeparkdentalgroup.example/',
    title: 'Hyde Park Dental Group - 9 dentists, 3 Austin locations',
    content: 'Multi-location group with a central call center and online scheduling.',
    contact: '', company: 'Hyde Park Dental Group', fit: 38, maker: 'Operations director',
    why: 'Larger group that already runs a central call center, so the gap is small.',
    pains: [], angle: '',
  },
  {
    url: 'https://www.round-rock-kids-teeth.example/',
    title: 'Round Rock Kids Teeth | Pediatric Dentist',
    content: 'Pediatric practice, 5 chairs, serving Round Rock and north Austin. Parents can call or request an appointment online.',
    contact: '', company: 'Round Rock Kids Teeth', fit: 64, maker: 'Office manager',
    why: 'Right size, but online requests already cover part of the booking load.',
    pains: [], angle: '',
  },
  {
    url: 'https://www.dentalvendorreview.example/top-ai-phone-tools',
    title: 'Top 10 AI phone tools for dentists (2026)',
    content: 'A roundup of AI receptionist vendors for dental practices.',
    contact: '', company: 'Dental vendor roundup', fit: 8, maker: '',
    why: 'A vendor list, not a practice.',
    pains: [], angle: '',
  },
];

const byHost = (url) => PRACTICES.find((p) => url.includes(new URL(p.url).hostname.replace(/^www\./, '')));

export function standinSearch(query = '') {
  const q = String(query).toLowerCase();
  const pick = q.includes('hiring') || q.includes('front desk')
    ? [1, 0, 4, 5]
    : q.includes('review') || q.includes('phone')
      ? [2, 0, 3]
      : [0, 1, 2, 3, 4, 5];
  return pick.map((i, rank) => ({ url: PRACTICES[i].url, title: PRACTICES[i].title, content: PRACTICES[i].content, score: 0.9 - rank * 0.08 }));
}

export function standinExtract(url = '') {
  const p = byHost(url);
  return p ? `${p.title}\n${p.content}\n${p.contact}` : '';
}

function outreachFor(company) {
  const p = PRACTICES.find((x) => x.company === company) || PRACTICES[0];
  const first = p.maker.match(/\(([^)]+)\)/)?.[1]?.split(' ').filter((w) => !/^Dr\.?$/.test(w))[0] || '';
  const hi = first ? `Hi ${first},` : 'Hi there,';
  const hook = p.angle.replace(/\.$/, '').replace(/^Their /, 'your ').replace(/^A recent review/, 'a recent review of the studio');
  return {
    sequence: [
      { day: 1, channel: 'email', subject: `A quick idea for ${company}'s phones`, body: `${hi}\n\nI was on your site and noticed ${hook}. We build AI receptionists for small practices like yours: every call gets answered, missed callers get a text back within a minute, and appointments land straight in your calendar.\n\nI put together a one-page look at what that could mean for ${company}. Happy to send it over?` },
      { day: 2, channel: 'linkedin', subject: '', body: `${hi} I sent a short note about after-hours and lunch-hour calls at ${company}. No pitch here, just thought you would want to see the one-pager I made for you.` },
      { day: 3, channel: 'value-drop', subject: 'The 3 calls most Austin practices miss', body: `${hi}\n\nAcross small practices we work with, most missed calls happen in three windows: 12 to 1, the first 20 minutes after opening, and after 5. Each one is a new patient who usually books somewhere else. The one-pager I mentioned covers how ${company} could catch all three.` },
      { day: 4, channel: 'call', subject: '', body: `Quick call, under 2 minutes: mention the one-pager, ask how the front desk handles calls during lunch today, and offer a 15-minute walkthrough. If voicemail, leave the callback number and say you will follow up by email.` },
      { day: 5, channel: 'video', subject: `90 seconds on ${company}'s booking flow`, body: `${hi}\n\nI recorded a 90-second video calling your main line at lunch and showing what the caller would hear with an AI receptionist instead, including the text-back and the booked slot in the calendar.` },
      { day: 6, channel: 'email', subject: 'Worth 15 minutes?', body: `${hi}\n\nIf answering every call without adding headcount is on your list this quarter, I can show you the setup in 15 minutes. It connects to your current phone line and practice calendar, and there is nothing to install at the front desk.` },
      { day: 7, channel: 'email', subject: 'Closing the loop', body: `${hi}\n\nI will stop here so I am not cluttering your inbox. If the phones ever become the bottleneck, the one-pager is yours to keep and I am one reply away. Wishing the team at ${company} a great month.` },
    ],
    ice_breaker: {
      title: `Missed-call snapshot for ${company}`,
      format: '1-page audit',
      opening_line: `I called ${company} three times this week, at lunch, at 5:30 and on Saturday, and wrote down what happened.`,
      deliverable: [
        `## What a new patient experiences today`,
        `- **Lunch (12:20):** rang through to voicemail after 6 rings.`,
        `- **After hours (5:30):** voicemail says calls are returned the next business day.`,
        `- **Saturday:** no option to book or leave a request by text.`,
        '',
        `## What it likely costs`,
        `Small practices typically miss 20 to 30 percent of inbound calls, and most first-time callers do not leave a voicemail. At 4 missed new-patient calls a week, that is roughly 200 lost first visits a year.`,
        '',
        `## Three fixes, cheapest first`,
        `1. **Text back every missed call within a minute** so the caller has a reason to wait for you.`,
        `2. **Answer overflow and after-hours calls** with an assistant that books into your existing calendar.`,
        `3. **Offer a booking link in the voicemail greeting** for anyone who still reaches it.`,
      ].join('\n'),
      cta: 'Want me to set up the text-back for one week, free, so you can see the numbers?',
    },
  };
}

// Answers the plan, score and outreach prompts from server/leadhound/prompts.js.
export function standinComplete(messages = []) {
  const system = String(messages[0]?.content || '');
  const user = String(messages[1]?.content || '');
  let payload;
  if (system.includes('3 web search queries')) {
    payload = {
      queries: [
        'independent dental practice Austin TX 2-6 chairs new patients',
        'Austin dental office hiring front desk coordinator phones scheduling',
        'Austin dentist reviews hard to reach by phone',
      ],
      ideal_profile: 'Owner-run Austin practices with 2 to 6 chairs where the front desk also answers every phone call.',
    };
  } else if (system.includes('You qualify sales leads')) {
    const rows = [...user.matchAll(/^\[(\d+)\] (.+)$/gm)];
    payload = {
      leads: rows.map(([, index, title]) => {
        const p = PRACTICES.find((x) => x.title === title.trim()) || {};
        return { index: Number(index), company: p.company, fit_score: p.fit ?? 30, why_fit: p.why, pain_points: p.pains, decision_maker: p.maker, angle: p.angle };
      }),
    };
  } else {
    const company = user.match(/^Company: (.+)$/m)?.[1]?.trim() || '';
    payload = outreachFor(company);
  }
  return `\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\``;
}

// A stand-in Tavily HTTP API (POST /search, POST /extract) for end-to-end
// runs; point TAVILY_API_BASE at the returned url.
export function startStandinTavily({ port = 0 } = {}) {
  const calls = [];
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      const body = raw ? JSON.parse(raw) : {};
      calls.push({ path: req.url, auth: req.headers.authorization, body });
      res.setHeader('Content-Type', 'application/json');
      if (!String(req.headers.authorization || '').startsWith('Bearer tvly-')) {
        res.statusCode = 401;
        res.end(JSON.stringify({ detail: { error: 'Unauthorized' } }));
      } else if (req.url === '/search') {
        res.end(JSON.stringify({ query: body.query, results: standinSearch(body.query).slice(0, body.max_results || 6) }));
      } else if (req.url === '/extract') {
        res.end(JSON.stringify({ results: (body.urls || []).map((url) => ({ url, raw_content: standinExtract(url) })) }));
      } else {
        res.statusCode = 404;
        res.end('{}');
      }
    });
  });
  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      resolve({ url: `http://127.0.0.1:${server.address().port}`, calls, close: () => new Promise((r) => server.close(r)) });
    });
  });
}
