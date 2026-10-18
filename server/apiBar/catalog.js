// server/apiBar/catalog.js
//
// The API Bar's menu. The bar is one front door (/api/bar) with a doorman:
// a caller hands over one note shaped the same way every time,
//   { api_bar: { branch, action, paginate, page, page_size }, ...input }
// and the doorman passes it to the API behind that branch, then carries the
// answer back. Each action below points at an existing censaiOS route (the
// bar never re-implements one) or at a small bar handler ("run").
//
//   changes  true when the action spends money (a model or search call) or
//            changes something; a "look only" key cannot use it.
//   listKey  where the list sits in the answer, so the bar can page it.
//   query    input fields passed along as the route's query string.
//   body     true when the input is passed along as the route's body.

export const BRANCHES = Object.freeze({
  finance: {
    label: 'Finance',
    about: 'Your Open Books windows (Add > YorWare Suite > Books).',
    actions: {
      search: {
        about: 'Find transactions by words, year or dates.',
        run: 'finance.search', listKey: 'transactions',
        input: { query: 'coffee', year: '2026', from: '', to: '' },
      },
      summary: {
        about: 'Money in, money out and the total for each tax category in one year.',
        run: 'finance.summary', listKey: 'categories',
        input: { year: '2026' },
      },
    },
  },
  leads: {
    label: 'Leads',
    about: 'LeadHound and the Lead Queue.',
    actions: {
      saved: {
        about: 'The leads already saved in your Lead Queue.',
        method: 'GET', path: '/api/sales-leads', query: ['status', 'min_score'], listKey: 'leads',
        input: { status: '', min_score: '' },
      },
      status: {
        about: 'Whether LeadHound has a Tavily key to search with.',
        method: 'GET', path: '/api/leadhound/status',
        input: {},
      },
      hunt: {
        about: 'Run one hunt: what you sell and who you sell to in, scored leads with a 7-day plan out.',
        method: 'POST', path: '/api/leadhound/run', body: true, changes: true, listKey: 'leads',
        input: { business: 'Real estate photography', market: 'Listing agents', region: 'Des Moines, Iowa', maxLeads: 3 },
      },
    },
  },
  research: {
    label: 'Research',
    about: 'Tavily web search with your own key.',
    actions: {
      search: {
        about: 'Search the web and get the best pages back.',
        method: 'POST', path: '/api/research/search', body: true, changes: true, listKey: 'results',
        input: { query: 'best CRM for small real estate teams' },
      },
    },
  },
  agents: {
    label: 'Agents',
    about: 'Agents you shared (Share > Reach from outside). Each one has an ID card the bar signs.',
    actions: {
      list: {
        about: 'The agents you are sharing right now, each with its ID card.',
        run: 'agents.list', listKey: 'agents',
        input: {},
      },
      ask: {
        about: 'Ask one shared agent a question. Same limits and receipts as its own outside door.',
        run: 'agents.ask', changes: true,
        input: { agent: 'paste an agent id from "list"', message: 'What is on my plate today?' },
      },
    },
  },
  files: {
    label: 'Files',
    about: 'Files in the project folder on this computer.',
    actions: {
      search: {
        about: 'Find files whose name has these words.',
        method: 'GET', path: '/api/files/search', query: ['q', 'path'], listKey: 'results',
        input: { q: 'readme' },
      },
      read: {
        about: 'Read one text file.',
        method: 'GET', path: '/api/files/content', query: ['path'],
        input: { path: 'README.md' },
      },
    },
  },
  boards: {
    label: 'Boards',
    about: 'Projects your agents work on.',
    actions: {
      projects: {
        about: 'Every project, with its folder and summary.',
        method: 'GET', path: '/api/projects', listKey: 'projects',
        input: {},
      },
    },
  },
});

export const BRANCH_NAMES = Object.freeze(Object.keys(BRANCHES));

/** The action entry, or null when the branch or action is not on the menu. */
export function findAction(branch, action) {
  const b = Object.hasOwn(BRANCHES, String(branch)) ? BRANCHES[branch] : null;
  if (!b || !Object.hasOwn(b.actions, String(action))) return null;
  return b.actions[action];
}

/** The menu as plain data, for GET /api/bar and the window. */
export function describeMenu({ allowed = null } = {}) {
  return BRANCH_NAMES
    .filter((name) => !allowed || allowed.includes(name))
    .map((name) => {
      const b = BRANCHES[name];
      return {
        branch: name,
        label: b.label,
        about: b.about,
        actions: Object.entries(b.actions).map(([action, a]) => ({
          action,
          about: a.about,
          changes: Boolean(a.changes),
          pages: Boolean(a.listKey),
          example: { api_bar: { branch: name, action, paginate: Boolean(a.listKey) }, ...a.input },
        })),
      };
    });
}
