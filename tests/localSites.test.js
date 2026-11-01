import { unzipSync, strFromU8 } from 'fflate';
import { SITE_PRESETS, startSite } from '../src/lib/localSites/presets.js';
import { parseItems, safeUrl, siteHtml } from '../src/lib/localSites/siteHtml.js';
import { readSiteJson, siteFiles, siteZip } from '../src/lib/localSites/siteFiles.js';

describe('Local Sites presets', () => {
  test.each(SITE_PRESETS.map((p) => p.id))('%s builds a whole site folder', (id) => {
    const site = startSite(id);
    const files = siteFiles(site);
    expect(Object.keys(files).sort()).toEqual([
      'READ ME.txt', 'index.html', 'photos/photo-1.svg', 'photos/photo-2.svg', 'photos/photo-3.svg',
      'photos/photo-4.svg', 'photos/photo-5.svg', 'photos/photo-6.svg', 'site.json', 'style.css',
    ]);
    const html = strFromU8(files['index.html']);
    expect(html).toContain(`<h1>${site.name}</h1>`);
    expect(html).toContain('href="tel:5550100123"');
    expect(html).toContain('google.com/maps?q=123%20Main%20Street');
    expect(html).toContain('<link rel="stylesheet" href="style.css">');
    expect(html).toContain('application/ld+json');
    for (const day of ['Monday', 'Sunday']) expect(html).toContain(`<th>${day}</th>`);
  });

  test('the three shops look different', () => {
    const looks = new Set(SITE_PRESETS.map((p) => p.palette.accent));
    expect(SITE_PRESETS.map((p) => p.id)).toEqual(['thrift', 'tattoo', 'bakery']);
    expect(looks.size).toBe(3);
  });
});

describe('what the owner types', () => {
  test('is escaped everywhere it lands', () => {
    const site = { ...startSite('bakery'), name: '<script>alert(1)</script>', items: 'Pie <b> | $5', about: '"quoted" & more' };
    const html = siteHtml(site);
    expect(html).not.toContain('<script>alert(1)');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('Pie &lt;b&gt;');
    expect(html).toContain('&quot;quoted&quot; &amp; more');
    // Inside the search-engine data block a closing tag must not end it early.
    const ld = html.split('application/ld+json">')[1].split('</script>')[0];
    expect(ld).not.toContain('<');
  });

  test('links keep only web addresses', () => {
    expect(safeUrl('javascript:alert(1)')).toBe('');
    expect(safeUrl('https://example.com/reviews')).toBe('https://example.com/reviews');
    const html = siteHtml({ ...startSite('tattoo'), instagram: 'javascript:alert(1)', facebook: 'https://facebook.com/example' });
    expect(html).not.toContain('javascript:');
    expect(html).toContain('href="https://facebook.com/example"');
  });

  test('menu lines split on the bar', () => {
    expect(parseItems('Loaf | $8\n\nCoffee')).toEqual([{ name: 'Loaf', note: '$8' }, { name: 'Coffee', note: '' }]);
  });
});

describe('the contact form', () => {
  test('without a key it opens the email app', () => {
    const html = siteHtml(startSite('thrift'));
    expect(html).toContain('action="mailto:hello@example.com"');
    expect(html).not.toContain('web3forms');
  });

  test('with a key it posts to the form service', () => {
    const html = siteHtml({ ...startSite('thrift'), formKey: 'abcd-1234"><x' });
    expect(html).toContain('action="https://api.web3forms.com/submit"');
    expect(html).toContain('name="access_key" value="abcd-1234x"');
  });
});

describe('the download', () => {
  test('zips into one folder named after the shop, with picked photos', () => {
    const photo = new Uint8Array([1, 2, 3]);
    const zip = unzipSync(siteZip(startSite('bakery'), { 0: { bytes: photo, ext: 'jpg' } }));
    expect(zip['morning-crumb-bakery/photos/photo-1.jpg']).toEqual(photo);
    expect(zip['morning-crumb-bakery/photos/photo-1.svg']).toBeUndefined();
    expect(strFromU8(zip['morning-crumb-bakery/index.html'])).toContain('src="photos/photo-1.jpg"');
  });

  test('site.json opens again, ignoring anything it does not know', () => {
    const site = { ...startSite('tattoo'), name: 'Example Ink' };
    const json = strFromU8(siteFiles(site)['site.json']);
    const back = readSiteJson(json.replace('"name"', '"evil": "x", "name"'));
    expect(back.name).toBe('Example Ink');
    expect(back.preset).toBe('tattoo');
    expect(back.evil).toBeUndefined();
    expect(() => readSiteJson('{"nope":1}')).toThrow('not a saved Local Sites site');
  });
});
