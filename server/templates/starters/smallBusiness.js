// Starter board: Small Business. Find customers with LeadHound, keep the
// numbers in a sheet, plan the week, and talk as a team, with two AI
// teammates that draft outreach and plan while people decide.

import { defaultId, finishBoard, leaf, split, starterAgent, teamChatWindow } from './shared.js';

export const SMALL_BUSINESS_TEMPLATE_ID = 'small-business';

export const SMALL_BUSINESS_AGENTS = Object.freeze([
  starterAgent({
    key: 'salesHelper',
    name: 'Sales Helper',
    role: 'Finds customers and drafts the first hello',
    description: 'Researches a prospect, then drafts a short, personal first email or call script. Nothing is sent; you copy what you like.',
    glyph: 'S',
    hue: 32,
    tools: ['web_search', 'web_extract', 'lead_list'],
    prompt: 'You are the Sales Helper for a small business. Research a prospect from public pages, then draft a short first message that mentions one specific, true thing about them and one clear reason to talk. Put drafts in the Outreach drafts document with canvas_append_window. Never invent facts about a person or a company; say what you could not confirm.',
    starters: ['Draft a first email to the top lead from LeadHound', 'Write a two-minute call script for a cold call', 'What should I say when they ask about price?'],
  }),
  starterAgent({
    key: 'officeManager',
    name: 'Office Manager',
    role: 'Plans the week and writes the paperwork',
    description: 'Plans the week, turns notes into tidy documents (quotes, policies, thank-you notes) and keeps the to-do list honest.',
    glyph: 'O',
    hue: 220,
    tools: ['web_search'],
    prompt: 'You are the Office Manager for a small business. Plan the week around what makes money first, write tidy everyday documents (quotes, invoice notes, policies, thank-you notes) in plain language, and post a short Monday plan in Team Chat. You do not have access to bank accounts or payments.',
    starters: ['Plan this week around three big jobs', 'Write a simple quote for a customer', 'Write a friendly late-payment reminder'],
  }),
]);

const OUTREACH = [
  '# Outreach drafts',
  '',
  'The Sales Helper puts first emails and call scripts here. Nothing is sent from the board: copy what you like into your own email.',
  '',
].join('\n');

const NOTES = '# Customer notes\n\nOne line per customer: who they are, what they bought, what they asked for next.\n';

const WEEK = [
  'Run a LeadHound hunt for your best kind of customer',
  'Send three first emails (the Sales Helper drafts them)',
  'Put this month\'s money in and out in the sheet',
  'Follow up with last week\'s customers',
];

export function buildSmallBusinessBoard({ agents, makeId = defaultId }) {
  const tag = makeId();
  const wid = (role) => `sb-${role}-${tag}`;
  const ids = {
    hound: wid('leadhound'), outreach: wid('outreach'), salesChat: wid('sales-chat'),
    sheet: wid('money'), notes: wid('customer-notes'),
    calendar: wid('calendar'), week: wid('this-week'), officeChat: wid('office-chat'),
    teamChat: wid('team-chat'),
  };

  const windows = [
    // F1 Customers
    { id: ids.hound, kind: 'leadHound', title: 'LeadHound' },
    { id: ids.outreach, kind: 'doc', title: 'Outreach drafts', fileName: 'outreach-drafts.md', text: OUTREACH, templateRole: 'outreach' },
    { id: ids.salesChat, kind: 'chat', title: 'Sales Helper', agentId: agents.salesHelper },
    // F2 Money (the sheet takes its blank starter book on the client)
    { id: ids.sheet, kind: 'officeSheets', title: 'Money in and out' },
    { id: ids.notes, kind: 'doc', title: 'Customer notes', fileName: 'customer-notes.md', text: NOTES, templateRole: 'customerNotes' },
    // F3 This week
    { id: ids.calendar, kind: 'calendar', title: 'Calendar' },
    { id: ids.week, kind: 'todos', title: 'This week', items: WEEK.map((text, i) => ({ id: i + 1, text, done: false, assignee: null })) },
    { id: ids.officeChat, kind: 'chat', title: 'Office Manager', agentId: agents.officeManager },
    // F4 Team Chat
    teamChatWindow(ids.teamChat, { from: agents.officeManager, text: 'Welcome to your business board. This week\'s list is in F3; tell me your three biggest jobs and I will plan around them.' }),
  ];

  const groups = [
    { key: 'customers', label: 'Customers', hotkey: '1', x: 0, y: 0, w: 1640, h: 900, root: split('vertical', 0.52, leaf(ids.hound), split('horizontal', 0.55, leaf(ids.outreach), leaf(ids.salesChat))) },
    { key: 'money', label: 'Money', hotkey: '2', x: 1800, y: 0, w: 1480, h: 900, root: split('vertical', 0.66, leaf(ids.sheet), leaf(ids.notes)) },
    { key: 'week', label: 'This week', hotkey: '3', x: 0, y: 1060, w: 1640, h: 760, root: split('vertical', 0.36, leaf(ids.calendar), split('vertical', 0.45, leaf(ids.week), leaf(ids.officeChat))) },
    { key: 'team', label: 'Team Chat', hotkey: '4', x: 1800, y: 1060, w: 720, h: 760, root: leaf(ids.teamChat) },
  ];

  return finishBoard({ templateId: SMALL_BUSINESS_TEMPLATE_ID, name: 'Small Business', prefix: 'sb', tag, windows, groups, windowIds: ids });
}

export const SMALL_BUSINESS_TEMPLATE = Object.freeze({
  id: SMALL_BUSINESS_TEMPLATE_ID,
  name: 'Small Business',
  description: 'Find customers with LeadHound, keep the money in a sheet, plan the week, and two AI teammates that draft outreach and paperwork.',
  groups: ['Customers', 'Money', 'This week', 'Team Chat'],
  groupContents: {
    Customers: 'LeadHound, outreach drafts, Sales Helper',
    Money: 'Money in and out sheet, customer notes',
    'This week': 'Calendar, to-do list, Office Manager',
    'Team Chat': 'Team chat',
  },
  agents: SMALL_BUSINESS_AGENTS.map(agent => agent.name),
  modules: ['LeadHound', 'Sheets', 'Calendar', 'To-do list'],
});
