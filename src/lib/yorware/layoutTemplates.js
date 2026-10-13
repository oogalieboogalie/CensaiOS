// Ready-made starting points for YorWare Layout: a blank page, a flyer, a
// property listing sheet, a menu and a two-page newsletter whose article
// flows from page 1 onto page 2. Each is built from the same patches the
// editor uses, so a template is just a document someone already started.
import {
  MASTER, addFramePatch, addPagePatch, linkFramePatch, makeLayoutDoc, readLayout,
} from './layoutModel.js';

// Ink for the printed page, not interface colors. Ultem amber leads.
export const LAYOUT_INK = Object.freeze({
  black: '#111111', white: '#ffffff', amber: '#e5a83a', charcoal: '#1f2328', grey: '#6b7280', paper: '#f4efe6', green: '#2f6f4f', navy: '#1d2a5b',
});
export const LAYOUT_SWATCHES = Object.freeze(['#111111', '#ffffff', '#e5a83a', '#1f2328', '#6b7280', '#f4efe6', '#2f6f4f', '#1d2a5b', '#b42318', 'none']);

const ARTICLE = [
  'This spring the shop moved two doors down, into the old bakery with the big front window. The ovens are gone, but the light is the same, and so are most of you: thank you for walking the extra forty steps.',
  'What changes for you: longer hours on Thursday and Friday, a quiet corner with four desks you can book by the hour, and a wall of local work that turns over every month. What stays: the same faces, the same coffee, the same prices.',
  'We asked a dozen regulars what they wanted from the new space. The answers were short. More plugs. Fewer stools without backs. A place to leave a stroller. All three are done, and the fourth request, a dog water bowl by the door, turned out to be the most popular change of all.',
  'Next month we start a Saturday morning series: twenty minutes from someone in the neighborhood about the thing they know best. First up is a beekeeper from Elm Street, then a bike mechanic, then a retired type designer who promised to bring samples.',
  'If you run a small business nearby and want to pin your flyer on the board, just bring it in. If you want to give a Saturday talk, leave your name at the counter. The schedule is on the back page.',
  'A few practical notes. Parking is still on the street, but the lot behind the hardware store is free after six and all day on Sunday. The side door has a ramp now, and the restroom is on the ground floor. Wi-Fi is the same network name; the password is on every table.',
  'Finally, a thank-you to the people who carried boxes on moving day: the soccer team from the high school, three neighbors who refused to be named, and one very patient delivery driver. The first round on Saturday is on us.',
].join('\n');

const MENU = [
  'BREAKFAST', 'Two eggs any style, toast, potatoes ....... 9', 'Buttermilk pancakes, maple butter ....... 10', 'Granola, yogurt, honey, berries ....... 8', '',
  'LUNCH', 'Grilled cheese, tomato soup ....... 12', 'Chicken salad on rye ....... 13', 'Market greens, lemon, parmesan ....... 11', '',
  'SIDES', 'Bacon or sausage ....... 4', 'Fruit cup ....... 4', 'Fries ....... 5', '',
  'DRINKS', 'Drip coffee, free refills ....... 3', 'Latte or cappuccino ....... 5', 'Fresh orange juice ....... 5',
].join('\n');

export const LAYOUT_TEMPLATES = Object.freeze([
  { id: 'blank', label: 'Blank page', hint: 'One empty Letter page' },
  { id: 'flyer', label: 'Flyer', hint: 'Big headline, a picture, the details' },
  { id: 'listing', label: 'Listing sheet', hint: 'A home for sale: photo, price, features' },
  { id: 'menu', label: 'Menu', hint: 'Two columns of dishes and prices' },
  { id: 'newsletter', label: 'Newsletter', hint: 'Two pages; the story flows on to page 2' },
]);

function builder(win) {
  let w = { ...win };
  const doc = () => readLayout(w);
  const apply = (patch) => { w = { ...w, ...patch }; };
  return {
    win: () => w,
    page() { const r = addPagePatch(doc()); apply(r.patch); return r.id; },
    frame(page, fields, story) { const r = addFramePatch(doc(), { page, ...fields }, story); apply(r.patch); return r.id; },
    link(fromFrame, toFrame) { apply(linkFramePatch(doc(), doc().frames[fromFrame].story, toFrame)); },
  };
}

const I = LAYOUT_INK;

/** The full window patch for a template, ready to apply to an empty window. */
export function templatePatch(id, base = {}) {
  const b = builder({ ...base, ...makeLayoutDoc('letter') });
  const p1 = b.page();
  if (id === 'flyer') {
    b.frame(p1, { type: 'rect', x: 0, y: 0, w: 612, h: 200, fill: I.charcoal, stroke: 'none', sw: 0 });
    b.frame(p1, { type: 'text', x: 48, y: 52, w: 516, h: 30 }, { text: 'SATURDAY, MAY 9  ·  10 AM TO 4 PM', size: 14, bold: true, color: I.amber });
    b.frame(p1, { type: 'text', x: 48, y: 88, w: 516, h: 96 }, { text: 'Grand Opening', size: 64, bold: true, font: 'serif', color: I.white, lead: 1.1 });
    b.frame(p1, { type: 'image', x: 48, y: 228, w: 516, h: 300, fit: 'fill', fill: I.paper });
    b.frame(p1, { type: 'text', x: 48, y: 552, w: 516, h: 120 }, { text: 'Free coffee for the first hundred people, live music from noon, and ten percent off everything in the shop all day.\nBring a friend. Bring your dog. Bring an appetite.', size: 16, lead: 1.45 });
    b.frame(p1, { type: 'line', x: 48, y: 690, w: 516, h: 0, stroke: I.amber, sw: 3 });
    b.frame(p1, { type: 'text', x: 48, y: 706, w: 516, h: 40 }, { text: '214 Main Street  ·  (555) 010-2040  ·  hello@example.com', size: 12, color: I.grey, align: 'center' });
  } else if (id === 'listing') {
    b.frame(p1, { type: 'image', x: 0, y: 0, w: 612, h: 330, fit: 'fill', fill: I.paper });
    b.frame(p1, { type: 'rect', x: 36, y: 290, w: 220, h: 64, fill: I.amber, stroke: 'none', sw: 0 });
    b.frame(p1, { type: 'text', x: 50, y: 302, w: 200, h: 48 }, { text: '$489,000', size: 34, bold: true, color: I.black });
    b.frame(p1, { type: 'text', x: 36, y: 378, w: 540, h: 70 }, { text: '12 Oak Street\nMaple Grove', size: 26, bold: true, font: 'serif', lead: 1.15 });
    b.frame(p1, { type: 'text', x: 36, y: 456, w: 540, h: 24 }, { text: '4 bedrooms  ·  2.5 baths  ·  2,140 sq ft  ·  0.3 acre lot', size: 13, bold: true, color: I.grey });
    b.frame(p1, { type: 'text', x: 36, y: 496, w: 540, h: 96, cols: 2 }, { text: 'Sunny corner lot on a quiet street, five minutes from the elementary school and the park.\nNew roof (2024), updated kitchen with quartz counters, gas range and a walk-in pantry.\nPrimary suite on the main floor with a walk-in closet.\nFinished basement with a playroom and plenty of storage.\nFenced back yard, mature maple trees, two-car garage.', size: 12, lead: 1.45 });
    b.frame(p1, { type: 'line', x: 36, y: 690, w: 540, h: 0, stroke: I.black, sw: 1 });
    b.frame(p1, { type: 'image', x: 36, y: 704, w: 52, h: 52, fit: 'fill', fill: I.paper });
    b.frame(p1, { type: 'text', x: 100, y: 706, w: 476, h: 50 }, { text: 'Your Name, Realtor\n(555) 010-2040  ·  you@example.com', size: 12, lead: 1.4 });
  } else if (id === 'menu') {
    b.frame(p1, { type: 'rect', x: 24, y: 24, w: 564, h: 744, fill: 'none', stroke: I.black, sw: 2 });
    b.frame(p1, { type: 'text', x: 48, y: 60, w: 516, h: 60 }, { text: 'The Corner Kitchen', size: 40, font: 'serif', bold: true, align: 'center' });
    b.frame(p1, { type: 'text', x: 48, y: 122, w: 516, h: 24 }, { text: 'Open daily 7 am to 3 pm', size: 13, align: 'center', color: I.grey });
    b.frame(p1, { type: 'line', x: 200, y: 160, w: 212, h: 0, stroke: I.amber, sw: 2 });
    b.frame(p1, { type: 'text', x: 60, y: 190, w: 492, h: 540, cols: 2 }, { text: MENU, size: 13, font: 'serif', lead: 1.6 });
  } else if (id === 'newsletter') {
    const p2 = b.page();
    b.frame(MASTER, { type: 'line', x: 48, y: 744, w: 516, h: 0, stroke: I.grey, sw: 0.75 });
    b.frame(MASTER, { type: 'text', x: 48, y: 752, w: 516, h: 18 }, { text: 'The Corner Letter  ·  Spring issue  ·  page {page} of {pages}', size: 9, color: I.grey, align: 'right' });
    b.frame(p1, { type: 'text', x: 48, y: 48, w: 516, h: 70 }, { text: 'The Corner Letter', size: 48, font: 'serif', bold: true });
    b.frame(p1, { type: 'line', x: 48, y: 124, w: 516, h: 0, stroke: I.black, sw: 2 });
    b.frame(p1, { type: 'text', x: 48, y: 140, w: 516, h: 40 }, { text: 'We moved. Here is what that means for you.', size: 22, font: 'serif' });
    b.frame(p1, { type: 'image', x: 48, y: 190, w: 516, h: 280, fit: 'fill', fill: I.paper });
    const a1 = b.frame(p1, { type: 'text', x: 48, y: 490, w: 516, h: 240, cols: 2 }, { text: ARTICLE, size: 12, font: 'serif', lead: 1.45 });
    b.frame(p2, { type: 'text', x: 48, y: 48, w: 516, h: 30 }, { text: 'Continued from page 1', size: 11, bold: true, color: I.grey });
    const a2 = b.frame(p2, { type: 'text', x: 48, y: 84, w: 516, h: 300, cols: 2 });
    b.link(a1, a2);
    b.frame(p2, { type: 'rect', x: 48, y: 410, w: 516, h: 150, fill: I.paper, stroke: 'none', sw: 0 });
    b.frame(p2, { type: 'text', x: 68, y: 428, w: 476, h: 120 }, { text: 'SATURDAY TALKS\nMay 9  Keeping bees on a city lot\nMay 16  Fix your own flat in five minutes\nMay 23  Letters that last: a life in type', size: 13, lead: 1.6 });
  }
  return b.win();
}
