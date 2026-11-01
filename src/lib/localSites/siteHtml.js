// Local Sites: the one-page website itself. Everything a visitor needs on a
// phone: what the shop is, a call button, hours, a map, the menu or prices,
// pictures and a form that reaches the owner. Every word the owner typed is
// escaped, and links only keep http(s) addresses.
import { DAYS, sitePreset } from './presets.js';

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

/** Only a web address survives; anything else (javascript:, data:) is dropped. */
export function safeUrl(s) {
  const t = String(s || '').trim();
  return /^https?:\/\/[^\s"'<>]+$/i.test(t) ? t : '';
}

const telHref = (phone) => String(phone || '').replace(/[^0-9+]/g, '');
const cleanEmail = (s) => (/^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/.test(String(s || '').trim()) ? String(s).trim() : '');
const cleanKey = (s) => String(s || '').replace(/[^A-Za-z0-9-]/g, '').slice(0, 64);

/** "Name | price" lines into rows; a line without a bar is just a name. */
export function parseItems(text) {
  return String(text || '').split('\n').map((l) => l.trim()).filter(Boolean).map((line) => {
    const [name, ...rest] = line.split('|');
    return { name: name.trim(), note: rest.join('|').trim() };
  });
}

const lines = (text) => String(text || '').split('\n').map((l) => l.trim()).filter(Boolean);

function schema(site, preset) {
  const data = {
    '@context': 'https://schema.org',
    '@type': preset.schemaType,
    name: site.name,
    description: site.tagline,
    telephone: site.phone || undefined,
    email: cleanEmail(site.email) || undefined,
    address: site.address || undefined,
    openingHours: DAYS.map((d, i) => `${d.slice(0, 2)} ${site.hours?.[i] || ''}`.trim()).filter((h) => !/closed/i.test(h)),
    sameAs: [site.googleLink, site.facebook, site.instagram].map(safeUrl).filter(Boolean),
  };
  // A closing script tag inside the data would end the block early.
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

function formHtml(site, preset) {
  const key = cleanKey(site.formKey);
  const email = cleanEmail(site.email);
  const fields = `
        <label>Your name<input name="name" required autocomplete="name"></label>
        <label>Phone or email<input name="contact" required></label>
        <label>${esc(preset.formAsk)}<textarea name="message" rows="4" required></textarea></label>`;
  if (key) {
    return `<form class="form" action="https://api.web3forms.com/submit" method="POST">
        <input type="hidden" name="access_key" value="${esc(key)}">
        <input type="hidden" name="subject" value="New message from the ${esc(site.name)} website">
        <input type="checkbox" name="botcheck" class="trap" tabindex="-1" autocomplete="off">${fields}
        <button class="btn" type="submit">Send</button>
      </form>`;
  }
  if (!email) return '<p class="muted">Call us during open hours and we will help you out.</p>';
  return `<form class="form" action="mailto:${esc(email)}" method="POST" enctype="text/plain">${fields}
        <button class="btn" type="submit">Send by email</button>
      </form>`;
}

function photoHtml(preset, photos) {
  return preset.photoCaptions.map((caption, i) => {
    const src = photos[i] || `photos/photo-${i + 1}.svg`;
    return `<figure><img src="${esc(src)}" alt="${esc(caption)}" loading="lazy"><figcaption>${esc(caption)}</figcaption></figure>`;
  }).join('\n          ');
}

/**
 * The page. `css` inlines the stylesheet (for the live preview); `photos`
 * maps a slot to its picture's address (an uploaded file or a data URL).
 */
export function siteHtml(site, { css = '', photos = [] } = {}) {
  const preset = sitePreset(site.preset);
  const name = esc(site.name || preset.site.name);
  const tel = telHref(site.phone);
  const address = String(site.address || '').trim();
  const mapQ = encodeURIComponent(address);
  const links = [
    [safeUrl(site.googleLink), 'Reviews on Google'],
    [safeUrl(site.facebook), 'Facebook'],
    [safeUrl(site.instagram), 'Instagram'],
  ].filter(([href]) => href);
  const fonts = [preset.fonts.head, preset.fonts.body].map((f) => `family=${f.replace(/ /g, '+')}:wght@400;600;700`).join('&');
  const items = parseItems(site.items).map((it) => `<li><span>${esc(it.name)}</span>${it.note ? `<b>${esc(it.note)}</b>` : ''}</li>`).join('\n          ');
  const hours = DAYS.map((d, i) => `<tr><th>${d}</th><td>${esc(site.hours?.[i] || '')}</td></tr>`).join('\n            ');
  const extra = lines(site.extra).map((l) => `<li>${esc(l)}</li>`).join('\n          ');
  const year = new Date().getFullYear();

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${name}</title>
  <meta name="description" content="${esc(site.tagline)}">
  <meta property="og:title" content="${name}">
  <meta property="og:description" content="${esc(site.tagline)}">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?${fonts}&display=swap">
  ${css ? `<style>${css}</style>` : '<link rel="stylesheet" href="style.css">'}
  <script type="application/ld+json">${schema(site, preset)}</script>
</head>
<body class="look-${preset.id}">
  <header class="top">
    <a class="brand" href="#">${name}</a>
    <nav><a href="#menu">${esc(preset.navLabel)}</a><a href="#hours">Hours</a><a href="#contact">Contact</a></nav>
  </header>
  <main>
    <section class="hero">
      <h1>${name}</h1>
      <p class="lead">${esc(site.tagline)}</p>
      <div class="actions">
        ${tel ? `<a class="btn" href="tel:${esc(tel)}">Call ${esc(site.phone)}</a>` : ''}
        ${address ? `<a class="btn ghost" href="https://www.google.com/maps/search/?api=1&amp;query=${mapQ}" target="_blank" rel="noopener">Get directions</a>` : ''}
      </div>
    </section>
    <section class="about"><p>${esc(site.about)}</p></section>
    <section id="menu" class="band">
      <h2>${esc(preset.itemsTitle)}</h2>
      <ul class="items">
          ${items}
      </ul>
    </section>
    <section class="gallery" aria-label="Photos">
          ${photoHtml(preset, photos)}
    </section>
    <section class="extra">
      <h2>${esc(preset.extraTitle)}</h2>
      <ul class="ticks">
          ${extra}
      </ul>
    </section>
    <section id="hours" class="visit band">
      <div>
        <h2>Hours</h2>
        <table class="hours">
            ${hours}
        </table>
      </div>
      <div>
        <h2>Find us</h2>
        <p>${esc(address)}</p>
        ${address ? `<iframe class="map" title="Map to ${name}" loading="lazy" src="https://www.google.com/maps?q=${mapQ}&amp;output=embed"></iframe>` : ''}
      </div>
    </section>
    <section id="contact" class="contact">
      <h2>${esc(preset.formTitle)}</h2>
      <p>${esc(preset.formIntro)}</p>
      ${formHtml(site, preset)}
      <p class="muted">${tel ? `Or call <a href="tel:${esc(tel)}">${esc(site.phone)}</a>` : ''}${tel && cleanEmail(site.email) ? ' · ' : ''}${cleanEmail(site.email) ? `email <a href="mailto:${esc(cleanEmail(site.email))}">${esc(cleanEmail(site.email))}</a>` : ''}</p>
      ${links.length ? `<p class="links">${links.map(([href, label]) => `<a href="${esc(href)}" target="_blank" rel="noopener">${label}</a>`).join('')}</p>` : ''}
    </section>
  </main>
  <footer class="foot">
    <p>&copy; ${year} ${name}${site.credit ? ` · Website by ${esc(site.credit)}` : ''}</p>
  </footer>
  ${tel ? `<a class="callbar" href="tel:${esc(tel)}">Call now</a>` : ''}
</body>
</html>
`;
}
