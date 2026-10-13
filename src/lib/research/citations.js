// Citations for the References recipe: APA 7 and MLA 9 from what a web
// search can tell us (author, year, title, site, link). Pure; shared by the
// browser and the server.

function siteName(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function clean(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function endWithPeriod(text) {
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

/** "Jane Doe" -> "Doe, J."; keeps organisation names as they are. */
function apaAuthor(author) {
  const name = clean(author);
  const parts = name.split(' ');
  if (parts.length < 2 || parts.length > 4 || /\b(inc|llc|university|institute|association|journal|news)\b/i.test(name)) return name;
  const last = parts.pop();
  return `${last}, ${parts.map((p) => `${p[0].toUpperCase()}.`).join(' ')}`;
}

function mlaAuthor(author) {
  const name = clean(author);
  const parts = name.split(' ');
  if (parts.length < 2 || parts.length > 4 || /\b(inc|llc|university|institute|association|journal|news)\b/i.test(name)) return name;
  const last = parts.pop();
  return `${last}, ${parts.join(' ')}`;
}

/** @param {{author?, year?, title, url, site?}} ref */
export function apaCitation(ref) {
  const title = clean(ref.title);
  const site = clean(ref.site) || siteName(ref.url);
  const year = clean(ref.year) || 'n.d.';
  const who = clean(ref.author) ? apaAuthor(ref.author) : title;
  const lead = clean(ref.author) ? `${endWithPeriod(who)} (${year}). ${endWithPeriod(title)}` : `${endWithPeriod(title)} (${year}).`;
  return `${lead}${site && site !== who ? ` ${endWithPeriod(site)}` : ''} ${ref.url}`.trim();
}

export function mlaCitation(ref) {
  const title = clean(ref.title);
  const site = clean(ref.site) || siteName(ref.url);
  const author = clean(ref.author) ? `${endWithPeriod(mlaAuthor(ref.author))} ` : '';
  const year = clean(ref.year) ? `, ${clean(ref.year)}` : '';
  return `${author}“${endWithPeriod(title).replace(/\.$/, '')}.” ${site ? `${site}${year}, ` : ''}${String(ref.url || '').replace(/^https?:\/\//, '')}.`;
}
