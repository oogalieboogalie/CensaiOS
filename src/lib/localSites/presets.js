// Local Sites: ready-made one-page websites for a small shop. Each preset is
// a starting business (made up, never a real one), its colors and fonts, and
// the words for its sections. Someone fills in their own name, hours and
// address, and the site downloads as a plain folder that runs anywhere.
// Pure data: the page itself is built in siteHtml.js.

export const DAYS = Object.freeze(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']);

const BASE = {
  phone: '(555) 010-0123',
  email: 'hello@example.com',
  address: '123 Main Street, Your Town, ST 00000',
  googleLink: '',
  facebook: '',
  instagram: '',
  formKey: '',
  credit: '',
};

export const SITE_PRESETS = Object.freeze([
  {
    id: 'thrift',
    label: 'Thrift store',
    hint: 'Donations, what is in this week, hours and a map',
    schemaType: 'Store',
    // Website colors for the business, not interface colors.
    palette: { bg: '#fbf7f0', surface: '#ffffff', ink: '#2b2622', soft: '#6b6158', accent: '#2f6f4f', accentInk: '#ffffff', band: '#e9f1ea' },
    fonts: { head: 'Fraunces', body: 'Work Sans' },
    navLabel: 'Shop',
    itemsTitle: 'Good finds, every week',
    itemsLabel: 'What you sell (one per line: name | price or note)',
    formTitle: 'Have something to donate?',
    formIntro: 'Tell us what you have and we will let you know the best time to drop it off.',
    formAsk: 'What would you like to donate?',
    extraTitle: 'Donation drop-off',
    photoCaptions: ['The front of the store', 'Racks of clothing', 'Furniture corner', 'Books and records', 'Housewares shelf', 'This week\'s window'],
    site: {
      ...BASE,
      name: 'Second Chapter Thrift',
      tagline: 'Gently used clothes, furniture and housewares at prices that make sense.',
      about: 'We are a neighborhood thrift store run by people who live here. Every sale keeps good things out of the landfill, and new items hit the floor every day, so it pays to stop in often.',
      hours: ['10 am to 6 pm', '10 am to 6 pm', '10 am to 6 pm', '10 am to 8 pm', '10 am to 8 pm', '9 am to 5 pm', 'Closed'],
      items: [
        'Clothing for the whole family | from $2',
        'Furniture and lamps | from $10',
        'Books, records and games | from $1',
        'Kitchen and housewares | from $1',
        'Half-price tag of the week | changes every Monday',
        'Seasonal and holiday corner | in stock now',
      ].join('\n'),
      extra: [
        'Drop off donations at the side door during open hours.',
        'We take clothing, shoes, housewares, books, toys and small furniture in good shape.',
        'We cannot take mattresses, car seats, cribs or anything broken.',
        'Ask for a receipt for your taxes at the counter.',
      ].join('\n'),
    },
  },
  {
    id: 'tattoo',
    label: 'Tattoo shop',
    hint: 'Artists, prices, booking request and aftercare',
    schemaType: 'TattooParlor',
    palette: { bg: '#121212', surface: '#1c1c1c', ink: '#f2efe9', soft: '#a8a39b', accent: '#c8453b', accentInk: '#ffffff', band: '#1f1a19' },
    fonts: { head: 'Bebas Neue', body: 'Inter' },
    navLabel: 'Prices',
    itemsTitle: 'Work and prices',
    itemsLabel: 'Services (one per line: name | price or note)',
    formTitle: 'Book a consultation',
    formIntro: 'Tell us your idea, where it goes and about how big. An artist will get back to you within two days.',
    formAsk: 'Your idea, placement and size',
    extraTitle: 'Before and after your session',
    photoCaptions: ['Fine line piece', 'Color traditional', 'Black and grey', 'Lettering', 'The studio', 'Flash wall'],
    site: {
      ...BASE,
      name: 'Iron Lantern Tattoo',
      tagline: 'Custom and walk-in tattoos in a clean, friendly studio.',
      about: 'We are a small studio with three resident artists. We do custom pieces, cover-ups and walk-in flash. Every station is cleaned and every needle is single-use, every time.',
      hours: ['Closed', '12 pm to 8 pm', '12 pm to 8 pm', '12 pm to 8 pm', '12 pm to 10 pm', '11 am to 10 pm', '12 pm to 6 pm'],
      items: [
        'Shop minimum | $80',
        'Walk-in flash | from $100',
        'Custom work | $150 an hour',
        'Cover-ups | free consult',
        'Piercing | from $40 plus jewelry',
        'Gift cards | any amount',
      ].join('\n'),
      extra: [
        'You must be 18 or older with a photo ID.',
        'Eat a good meal and drink water before your session.',
        'A deposit holds your appointment and comes off the final price.',
        'Keep the new tattoo clean, wash with unscented soap and stay out of pools for two weeks.',
      ].join('\n'),
    },
  },
  {
    id: 'bakery',
    label: 'Bakery',
    hint: 'Menu with prices, special orders and hours',
    schemaType: 'Bakery',
    palette: { bg: '#fff8f1', surface: '#ffffff', ink: '#3b2a20', soft: '#7a6457', accent: '#c06a3a', accentInk: '#ffffff', band: '#fbe9dc' },
    fonts: { head: 'Playfair Display', body: 'Lato' },
    navLabel: 'Menu',
    itemsTitle: 'Fresh from the oven',
    itemsLabel: 'Menu (one per line: name | price or note)',
    formTitle: 'Special orders',
    formIntro: 'Cakes, party trays and big orders need two days\' notice. Tell us what you need and when.',
    formAsk: 'What would you like, and for what day?',
    extraTitle: 'Ordering ahead',
    photoCaptions: ['Morning pastry case', 'Sourdough loaves', 'Birthday cake', 'Cookies by the dozen', 'Coffee bar', 'Our front window'],
    site: {
      ...BASE,
      name: 'Morning Crumb Bakery',
      tagline: 'Bread, pastries and cakes baked from scratch every morning.',
      about: 'We start baking at four so the case is full when the doors open. Everything is made here, by hand, with simple ingredients. When it is gone, it is gone, so come early on Saturdays.',
      hours: ['Closed', '7 am to 3 pm', '7 am to 3 pm', '7 am to 3 pm', '7 am to 5 pm', '7 am to 5 pm', '8 am to 1 pm'],
      items: [
        'Sourdough loaf | $8',
        'Butter croissant | $4',
        'Cinnamon roll | $4.50',
        'Cookies | $2 each, $20 a dozen',
        'Layer cake, 8 inch | from $40',
        'Coffee | $2.50',
      ].join('\n'),
      extra: [
        'Order cakes and trays at least 48 hours ahead.',
        'Pick up at the front counter during open hours.',
        'We can make many items without nuts or dairy; ask when you order.',
        'Leftover bread goes to the food pantry every evening.',
      ].join('\n'),
    },
  },
]);

export function sitePreset(id) {
  return SITE_PRESETS.find((p) => p.id === id) || SITE_PRESETS[0];
}

/** A fresh site for a preset: the preset's example business, ready to edit. */
export function startSite(id) {
  const p = sitePreset(id);
  return { preset: p.id, ...p.site, hours: [...p.site.hours] };
}
