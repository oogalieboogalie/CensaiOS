// Starter board: Creative Studio. A brief and ideas, the picture and vector
// editors, video with a teleprompter, and a content calendar, with three AI
// teammates that pitch, write and plan while people decide.

import { defaultId, finishBoard, leaf, split, starterAgent, teamChatWindow } from './shared.js';

export const CREATIVE_TEMPLATE_ID = 'creative-studio';

export const CREATIVE_AGENTS = Object.freeze([
  starterAgent({
    key: 'creativeDirector',
    name: 'Creative Director',
    role: 'Shapes the brief and the big idea',
    description: 'Turns a rough idea into a clear brief, pitches three directions and gives honest notes on the work.',
    glyph: 'D',
    hue: 320,
    tools: ['web_search', 'web_extract'],
    prompt: 'You are the Creative Director. Help the team agree on who the work is for, what it should make them feel and the one thing it must say. Pitch three distinct directions with a name, a one-line idea and a look (colors, type, mood). Give notes that are kind and specific: what works, what does not and what to try next.',
    starters: ['Fill in the creative brief with me', 'Pitch three directions for a coffee shop launch', 'Give me notes on the artwork in F2'],
  }),
  starterAgent({
    key: 'copywriter',
    name: 'Copywriter',
    role: 'Headlines, captions and scripts',
    description: 'Writes headlines, captions and short video scripts in the brand\'s voice, ready for the teleprompter.',
    glyph: 'C',
    hue: 40,
    tools: ['web_search'],
    prompt: 'You are the Copywriter. Write short, vivid copy in the voice the brief describes: headlines, captions, taglines and video scripts. Offer three options when asked for one line. Scripts are written to be read aloud: short sentences, one idea each, about 140 words a minute.',
    starters: ['Write ten headlines for the launch', 'Write a 30-second video script for the teleprompter', 'Make this caption shorter and warmer'],
  }),
  starterAgent({
    key: 'socialPlanner',
    name: 'Social Planner',
    role: 'Plans posts across the week',
    description: 'Plans a week of posts from one idea: what goes where, when, and which picture or clip goes with it.',
    glyph: 'S',
    hue: 170,
    tools: ['web_search'],
    prompt: 'You are the Social Planner. Turn one idea into a week of posts across the channels the team uses. For each post give the day, the channel, the hook in one line, and which picture or clip from the board goes with it. Post the week\'s plan in Team Chat in one short message.',
    starters: ['Plan a week of posts for the launch', 'Which day should the video go out?', 'Turn the brief into three Instagram posts'],
  }),
]);

const BRIEF = [
  '# Creative brief',
  '',
  '**Project:** (what are we making?)',
  '',
  '**Who it is for:** (one sentence about the person who will see it)',
  '',
  '**What it should make them feel:**',
  '',
  '**The one thing it must say:**',
  '',
  '**Where it will live:** (Instagram, a poster, a website, a video...)',
  '',
  '**Due:**',
  '',
  'Ask the Creative Director to fill this in with you.',
].join('\n');

const SCRIPT = 'Welcome to your studio.\n\nWrite your script here, or ask the Copywriter for one.\n\nPress Read, then Play, and the words scroll at your pace.';

const IDEAS = [
  'A poster that is mostly empty space',
  'A 15-second video with no words, just sound',
  'Behind the scenes: how the thing gets made',
];

const CALENDAR = [
  'Monday: teaser picture',
  'Wednesday: behind-the-scenes clip',
  'Friday: launch video',
  'Sunday: thank-you post',
];

export function buildCreativeBoard({ agents, makeId = defaultId }) {
  const tag = makeId();
  const wid = (role) => `cs-${role}-${tag}`;
  const ids = {
    brief: wid('brief'), ideas: wid('ideas'), directorChat: wid('director-chat'),
    vector: wid('vector'), photo: wid('photo'), genImage: wid('gen-image'),
    video: wid('video'), prompter: wid('teleprompter'), copyChat: wid('copy-chat'),
    teamChat: wid('team-chat'), calendar: wid('calendar'), socialChat: wid('social-chat'),
  };

  const windows = [
    // F1 Brief
    { id: ids.brief, kind: 'doc', title: 'Creative brief', fileName: 'creative-brief.md', text: BRIEF, templateRole: 'brief' },
    { id: ids.ideas, kind: 'idea', title: 'Idea pad', ideas: [...IDEAS] },
    { id: ids.directorChat, kind: 'chat', title: 'Creative Director', agentId: agents.creativeDirector },
    // F2 Design (the editors take their blank starter documents on the client)
    { id: ids.vector, kind: 'creativeVector', title: 'Artwork' },
    { id: ids.photo, kind: 'creativePhoto', title: 'Picture' },
    { id: ids.genImage, kind: 'genImage', title: 'Make an image', prompt: 'A warm, minimal poster for a neighborhood coffee shop, morning light' },
    // F3 Video
    { id: ids.video, kind: 'creativeVideo', title: 'Video' },
    { id: ids.prompter, kind: 'teleprompter', title: 'Teleprompter', text: SCRIPT },
    { id: ids.copyChat, kind: 'chat', title: 'Copywriter', agentId: agents.copywriter },
    // F4 Plan and share
    teamChatWindow(ids.teamChat, { from: agents.creativeDirector, text: 'Welcome to the studio. Start with the brief in F1; once we agree on it, everything else gets easier.' }),
    { id: ids.calendar, kind: 'todos', title: 'Content calendar', items: CALENDAR.map((text, i) => ({ id: i + 1, text, done: false, assignee: null })) },
    { id: ids.socialChat, kind: 'chat', title: 'Social Planner', agentId: agents.socialPlanner },
  ];

  const groups = [
    { key: 'brief', label: 'Brief', hotkey: '1', x: 0, y: 0, w: 1480, h: 820, root: split('vertical', 0.42, leaf(ids.brief), split('vertical', 0.52, leaf(ids.ideas), leaf(ids.directorChat))) },
    { key: 'design', label: 'Design', hotkey: '2', x: 1640, y: 0, w: 1800, h: 1000, root: split('vertical', 0.6, leaf(ids.vector), split('horizontal', 0.6, leaf(ids.photo), leaf(ids.genImage))) },
    { key: 'video', label: 'Video', hotkey: '3', x: 0, y: 1160, w: 1480, h: 900, root: split('horizontal', 0.62, leaf(ids.video), split('vertical', 0.55, leaf(ids.prompter), leaf(ids.copyChat))) },
    { key: 'share', label: 'Plan and share', hotkey: '4', x: 1640, y: 1160, w: 1400, h: 820, root: split('vertical', 0.36, leaf(ids.teamChat), split('vertical', 0.48, leaf(ids.calendar), leaf(ids.socialChat))) },
  ];

  return finishBoard({ templateId: CREATIVE_TEMPLATE_ID, name: 'Creative Studio', prefix: 'cs', tag, windows, groups, windowIds: ids });
}

export const CREATIVE_TEMPLATE = Object.freeze({
  id: CREATIVE_TEMPLATE_ID,
  name: 'Creative Studio',
  description: 'A brief, ideas, picture and vector editors, video with a teleprompter and a content calendar, with three AI teammates that pitch, write and plan.',
  groups: ['Brief', 'Design', 'Video', 'Plan and share'],
  groupContents: {
    Brief: 'Creative brief, idea pad, Creative Director',
    Design: 'Vector artwork, picture editor, image maker',
    Video: 'Video editor, teleprompter, Copywriter',
    'Plan and share': 'Team chat, content calendar, Social Planner',
  },
  agents: CREATIVE_AGENTS.map(agent => agent.name),
  modules: ['Vector', 'Photo', 'Video', 'Image maker', 'Teleprompter', 'Idea pad'],
});
