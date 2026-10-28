// Local Sites: the downloaded folder. index.html, style.css, a photos folder
// (the owner's pictures, or drawn stand-ins until they have some), site.json
// (the answers, so the site can be opened again and changed) and a
// READ ME with how to put it online in plain words.
import { strToU8, zipSync } from 'fflate';
import { esc, siteHtml } from './siteHtml.js';
import { siteCss } from './siteCss.js';
import { sitePreset, startSite } from './presets.js';

export function siteFolderName(name) {
  const stem = String(name || 'my-site').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
  return stem || 'my-site';
}

/** A stand-in picture in the site's colors, with what belongs there. */
export function placeholderSvg(presetId, caption) {
  const { palette: c } = sitePreset(presetId);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c.band}"/><stop offset="1" stop-color="${c.accent}" stop-opacity=".35"/></linearGradient></defs>
  <rect width="800" height="600" fill="url(#g)"/>
  <g fill="none" stroke="${c.accent}" stroke-width="10" stroke-linejoin="round"><rect x="330" y="230" width="140" height="100" rx="16"/><circle cx="400" cy="280" r="28"/><path d="M370 230l12-20h36l12 20"/></g>
  <text x="400" y="400" text-anchor="middle" font-family="system-ui, sans-serif" font-size="30" fill="${c.ink}">Your photo: ${esc(caption)}</text>
</svg>
`;
}

export function readMe(site) {
  const name = site.name || 'your site';
  return `${name} website
${'='.repeat(name.length + 8)}

This folder is the whole website. Open index.html to look at it on this computer.

PUT IT ONLINE FOR FREE (about 5 minutes)
1. Make a free Cloudflare account at dash.cloudflare.com.
2. Open "Workers & Pages", press "Create", pick Pages, and choose the
   option to drag and drop your files.
3. Name the project (for example ${siteFolderName(name)}) and drop this whole folder in.
4. Cloudflare gives you an address that ends in .pages.dev. That is your live site.
5. Optional: under "Custom domains" add a name you bought, like ${siteFolderName(name)}.com.

CHANGE THE WORDS OR HOURS
Open site.json in censaiOS (Local Sites, "Open a saved site"), change what you
need, download again and drop the new folder on the same Cloudflare project.

CHANGE A PICTURE
Put your picture in the photos folder with the same name as the one it
replaces. If yours is a .jpg and the old one is .svg, open index.html in
Notepad, find photo-1.svg and change it to photo-1.jpg.

THE CONTACT FORM
${site.formKey ? 'Messages go to the email you used to get the form key at web3forms.com.' : 'Right now the form opens the visitor\'s email app. For a form that sends by itself,\nget a free key at web3forms.com, paste it in Local Sites and download again.'}

GET FOUND ON GOOGLE MAPS
Claim the free Google Business Profile at business.google.com and put this
website's address in it. Then paste your Google review link into Local Sites.
`;
}

/**
 * Every file of the site as { path: Uint8Array }. `uploads` maps a photo slot
 * to { ext, bytes } for pictures the owner picked.
 */
export function siteFiles(site, uploads = {}) {
  const preset = sitePreset(site.preset);
  const photos = [];
  const files = {};
  preset.photoCaptions.forEach((caption, i) => {
    const up = uploads[i];
    if (up?.bytes) {
      photos[i] = `photos/photo-${i + 1}.${up.ext || 'jpg'}`;
      files[photos[i]] = up.bytes;
    } else {
      files[`photos/photo-${i + 1}.svg`] = strToU8(placeholderSvg(preset.id, caption));
    }
  });
  files['index.html'] = strToU8(siteHtml(site, { photos }));
  files['style.css'] = strToU8(siteCss(preset.id));
  files['site.json'] = strToU8(JSON.stringify({ localSite: 1, site }, null, 2));
  files['READ ME.txt'] = strToU8(readMe(site));
  return files;
}

export function siteZip(site, uploads) {
  const folder = siteFolderName(site.name);
  const files = siteFiles(site, uploads);
  return zipSync(Object.fromEntries(Object.entries(files).map(([p, bytes]) => [`${folder}/${p}`, bytes])));
}

/** A site.json someone saved earlier, back into a site (unknown fields dropped). */
export function readSiteJson(text) {
  const data = JSON.parse(text);
  const saved = data?.site;
  if (!saved || typeof saved !== 'object') throw new Error('That file is not a saved Local Sites site.');
  const base = startSite(saved.preset);
  const out = { ...base };
  for (const key of Object.keys(base)) {
    if (key === 'hours') out.hours = base.hours.map((h, i) => String(saved.hours?.[i] ?? h));
    else if (saved[key] !== undefined) out[key] = String(saved[key]);
  }
  out.preset = base.preset;
  return out;
}
