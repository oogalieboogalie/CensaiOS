// Spec 7: the Real Estate Team board. A pure builder: given the board's
// agents and the five modules, return the snapshot a client lays out on the
// canvas: four groups (Listings, Active Deals, Marketing, Team Chat) bound to
// F1 to F4, each with a layout tree the client fits into the group with the
// canvas's own layout code (so the template follows whatever group style the
// board uses).
//
// Windows carry a `templateRole` so agents' tools can find "the Team Chat"
// or "the Deal pipeline" on a board without knowing window ids.

import { randomUUID } from 'node:crypto';

export const REAL_ESTATE_TEMPLATE_ID = 'real-estate-team';

export const SAMPLE_LISTING = Object.freeze({
  address: '14 Alder Way',
  city: 'Maple Grove',
  beds: 3,
  baths: 2,
  sqft: 1850,
  price: 465000,
  features: 'Updated kitchen with quartz counters, south-facing backyard with a cedar deck, attached two-car garage, primary suite with walk-in closet, new roof (2024), quiet cul-de-sac, five minutes to the light rail.',
  photos: [],
});

// Sample deals for the Deal pipeline module. Its deadline checklist uses the
// same offsets as the module (days after the contract date), so the
// Transaction Coordinator has something real to remind people about.
export const DEAL_DEADLINES = Object.freeze([
  ['Earnest money due', 3], ['Inspection period ends', 10], ['Appraisal due', 21],
  ['Financing contingency', 25], ['Final walkthrough', 29], ['Closing', 30],
]);

function isoDay(date) {
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())).toISOString().slice(0, 10);
}

export function sampleDeals(today = new Date()) {
  const contract = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 8);
  const checklist = DEAL_DEADLINES.map(([label, days], i) => ({
    id: `d${i}`,
    label,
    due: isoDay(new Date(contract.getFullYear(), contract.getMonth(), contract.getDate() + days)),
    done: i === 0,
  }));
  return [
    { id: 'alder', client: 'Rivera', address: '14 Alder Way', price: 465000, stage: 'Under contract', contractDate: isoDay(contract), checklist },
    { id: 'harbor', client: 'Okafor', address: '902 Harbor St, Unit 4', price: 389000, stage: 'Offer' },
    { id: 'quarry', client: 'Lindqvist', address: '7 Quarry Rd', price: 712000, stage: 'Showing' },
    { id: 'birch', client: 'Nguyen', address: '31 Birch Ct', price: 0, stage: 'Lead' },
  ];
}

const leaf = (windowId) => ({ type: 'leaf', windowId });
const split = (axis, ratio, first, second) => ({ type: 'split', axis, ratio, first, second });

function moduleWindow(mod, { id, role, moduleData }) {
  const now = new Date().toISOString();
  return {
    id,
    kind: 'module',
    title: mod.manifest.name,
    templateRole: role,
    request: mod.request,
    status: 'ready',
    manifest: mod.manifest,
    source: mod.source,
    versions: [{ source: mod.source, manifest: mod.manifest, note: 'From the Real Estate Team template', by: 'Template', at: now }],
    versionIndex: 0,
    ...(moduleData ? { moduleData } : {}),
  };
}

function draftText(listing) {
  return [
    `# ${listing.address}`,
    '',
    'The Listing Writer\'s draft lands here: a description, a social post and an email blast, each checked for fair-housing words.',
    '',
    'Fill in the form on the left and press Write listing. Edit this copy freely; the agent\'s original stays in the Listing Writer window so you can compare.',
  ].join('\n');
}

/**
 * Build the board. `agents` maps each agent key (listingWriter,
 * marketAnalyst, transactionCoordinator, followUp) to its id on this board.
 * `modules` is loadRealEstateModules()'s result. `makeId` is a test seam.
 */
export function buildRealEstateBoard({ agents, modules, listing = SAMPLE_LISTING, today = new Date(), makeId = () => randomUUID().slice(0, 8) }) {
  const tag = makeId();
  const wid = (role) => `re-${role}-${tag}`;
  const ids = {
    listingWriter: wid('listing-writer'),
    listingDraft: wid('listing-draft'),
    listingChat: wid('listing-chat'),
    pipeline: wid('deal-pipeline'),
    showings: wid('showings'),
    commission: wid('commission'),
    tcChat: wid('tc-chat'),
    cma: wid('cma'),
    analystChat: wid('analyst-chat'),
    openHouse: wid('open-house'),
    teamChat: wid('team-chat'),
    outbox: wid('outbox'),
    followUpChat: wid('follow-up-chat'),
  };

  const windows = [
    // F1 Listings
    { id: ids.listingWriter, kind: 'listingWriter', title: 'Listing Writer', templateRole: 'listingWriter', agentId: agents.listingWriter, draftWindowId: ids.listingDraft, listing: { ...listing } },
    { id: ids.listingDraft, kind: 'doc', title: `Listing draft: ${listing.address}`, fileName: `Listing draft: ${listing.address}`, templateRole: 'listingDraft', text: draftText(listing) },
    { id: ids.listingChat, kind: 'chat', title: 'Listing Writer', agentId: agents.listingWriter },
    // F2 Active Deals
    moduleWindow(modules['deal-pipeline'], { id: ids.pipeline, role: 'dealPipeline', moduleData: { deals: sampleDeals(today) } }),
    moduleWindow(modules['showing-schedule'], { id: ids.showings, role: 'showingSchedule' }),
    moduleWindow(modules['commission-calculator'], { id: ids.commission, role: 'commissionCalculator' }),
    { id: ids.tcChat, kind: 'chat', title: 'Transaction Coordinator', agentId: agents.transactionCoordinator },
    // F3 Marketing
    moduleWindow(modules['cma-sheet'], { id: ids.cma, role: 'cmaSheet', moduleData: { subject: { address: listing.address, sqft: String(listing.sqft), beds: String(listing.beds), baths: String(listing.baths), adjBed: '12000', adjBath: '8000' } } }),
    { id: ids.analystChat, kind: 'chat', title: 'Market Analyst', agentId: agents.marketAnalyst },
    moduleWindow(modules['open-house-sign-in'], { id: ids.openHouse, role: 'openHouse', moduleData: { property: listing.address } }),
    // F4 Team Chat
    { id: ids.teamChat, kind: 'groupChat', title: 'Team Chat', templateRole: 'teamChat', members: ['censai'], msgs: [
      { from: agents.transactionCoordinator, text: 'Morning. Rivera (14 Alder Way): the inspection period ends in 2 days. I will post deadline reminders here as they come up.' },
    ] },
    { id: ids.outbox, kind: 'outbox', title: 'Outbox', templateRole: 'outbox', drafts: [
      {
        id: `d-${tag}`,
        status: 'pending',
        channel: 'email',
        to: 'Dana Whitfield',
        address: 'dana.whitfield@example.com',
        subject: 'Thanks for stopping by 14 Alder Way',
        body: 'Hi Dana,\n\nThanks for coming to the open house at 14 Alder Way on Saturday. You mentioned the backyard and the walk to the light rail; I put the HOA details and the 2024 roof invoice in a folder for you.\n\nWould a second look on Thursday evening work?\n\nBest,\nThe Alder Way team',
        agentId: agents.followUp,
        agentName: 'Follow-up Assistant',
        deal: '14 Alder Way',
        createdAt: new Date().toISOString(),
      },
    ] },
    { id: ids.followUpChat, kind: 'chat', title: 'Follow-up Assistant', agentId: agents.followUp },
  ];

  const groups = [
    {
      id: `re-group-listings-${tag}`, label: 'Listings', hotkey: '1', x: 0, y: 0, w: 1480, h: 780,
      root: split('vertical', 0.36, leaf(ids.listingWriter), split('vertical', 0.56, leaf(ids.listingDraft), leaf(ids.listingChat))),
    },
    {
      id: `re-group-deals-${tag}`, label: 'Active Deals', hotkey: '2', x: 1640, y: 0, w: 1640, h: 1000,
      root: split('horizontal', 0.56, leaf(ids.pipeline), split('vertical', 0.36, leaf(ids.showings), split('vertical', 0.45, leaf(ids.commission), leaf(ids.tcChat)))),
    },
    {
      id: `re-group-marketing-${tag}`, label: 'Marketing', hotkey: '3', x: 0, y: 1160, w: 1480, h: 780,
      root: split('vertical', 0.6, leaf(ids.cma), split('horizontal', 0.42, leaf(ids.analystChat), leaf(ids.openHouse))),
    },
    {
      id: `re-group-team-${tag}`, label: 'Team Chat', hotkey: '4', x: 1640, y: 1160, w: 1640, h: 780,
      root: split('vertical', 0.34, leaf(ids.teamChat), split('vertical', 0.52, leaf(ids.outbox), leaf(ids.followUpChat))),
    },
  ];

  const groupOf = {};
  const walk = (node, groupId) => {
    if (!node) return;
    if (node.type === 'leaf') groupOf[node.windowId] = groupId;
    else { walk(node.first, groupId); walk(node.second, groupId); }
  };
  groups.forEach(group => walk(group.root, group.id));

  return {
    templateId: REAL_ESTATE_TEMPLATE_ID,
    name: 'Real Estate Team',
    windows: windows.map(win => ({ ...win, groupId: groupOf[win.id] || null })),
    groups,
    hotkeys: Object.fromEntries(groups.map(group => [group.hotkey, group.id])),
    windowIds: ids,
  };
}
