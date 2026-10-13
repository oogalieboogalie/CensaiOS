// "Import sign-ins" for Browser windows (desktop build).
//
// The user exports cookies for a site from their own browser and picks the
// file. We keep only cookies that belong to the site on screen and hand them
// to the native pane's cookie store (src-tauri/src/browser_signin.rs). The
// file is read in memory and never sent to the server, saved on a board, or
// shown to agents.
//
// Accepted files:
// - cookies.txt (Netscape format), what "Get cookies.txt LOCALLY" and most
//   cookie export extensions write.
// - JSON arrays from cookie editor extensions (Cookie-Editor, EditThisCookie).

const SAME_SITE = { lax: 'lax', strict: 'strict', none: 'none', no_restriction: 'none' };

function sameSite(raw) {
  return SAME_SITE[String(raw || '').toLowerCase()] || null;
}

function parseNetscape(text) {
  const out = [];
  for (const rawLine of text.split(/\r?\n/)) {
    let line = rawLine;
    let httpOnly = false;
    // curl and most exporters mark HttpOnly cookies with this prefix.
    if (line.startsWith('#HttpOnly_')) {
      httpOnly = true;
      line = line.slice('#HttpOnly_'.length);
    } else if (!line.trim() || line.startsWith('#')) {
      continue;
    }
    const parts = line.split('\t');
    if (parts.length < 7) continue;
    const [domain, includeSubdomains, path, secure, expires, name, ...rest] = parts;
    const host = domain.trim();
    const sub = includeSubdomains.trim().toUpperCase() === 'TRUE';
    out.push({
      name: name.trim(),
      value: rest.join('\t'),
      domain: sub && !host.startsWith('.') ? `.${host}` : host,
      path: path || '/',
      expires: Number(expires) > 0 ? Math.floor(Number(expires)) : null,
      secure: secure.trim().toUpperCase() === 'TRUE',
      httpOnly,
      sameSite: null,
    });
  }
  return out;
}

function parseJson(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return [];
  }
  const list = Array.isArray(data) ? data : Array.isArray(data?.cookies) ? data.cookies : [];
  return list
    .filter((c) => c && typeof c.name === 'string' && typeof c.domain === 'string')
    .map((c) => {
      const expires = Number(c.expirationDate ?? c.expires ?? c.expiry);
      const host = c.domain.trim();
      return {
        name: c.name,
        value: String(c.value ?? ''),
        domain: c.hostOnly === false && !host.startsWith('.') ? `.${host}` : host,
        path: c.path || '/',
        expires: expires > 0 ? Math.floor(expires) : null,
        secure: Boolean(c.secure),
        httpOnly: Boolean(c.httpOnly),
        sameSite: sameSite(c.sameSite),
      };
    });
}

/** Read an exported cookie file (cookies.txt or JSON) into plain cookies. */
export function parseCookieFile(text) {
  const body = String(text || '').replace(/^\uFEFF/, '');
  const trimmed = body.trim();
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) return parseJson(trimmed);
  return parseNetscape(body);
}

/**
 * The site a host belongs to, close enough for picking cookies: the last two
 * labels, or three for two-letter country domains like example.co.uk.
 */
export function siteOf(host) {
  const labels = String(host || '').toLowerCase().replace(/^\.+/, '').split('.').filter(Boolean);
  if (labels.length <= 2) return labels.join('.');
  const [second, top] = labels.slice(-2);
  const keep = top.length === 2 && second.length <= 3 ? 3 : 2;
  return labels.slice(-keep).join('.');
}

/** Only cookies that the site at pageUrl would see, and none that are expired. */
export function cookiesForPage(cookies, pageUrl, now = Date.now()) {
  let host;
  try {
    host = new URL(pageUrl).hostname.toLowerCase();
  } catch {
    return [];
  }
  const site = siteOf(host);
  const nowSecs = Math.floor(now / 1000);
  return cookies.filter((c) => {
    if (!c.name) return false;
    if (c.expires && c.expires < nowSecs) return false;
    const domain = c.domain.toLowerCase().replace(/^\./, '');
    return domain === site || domain.endsWith(`.${site}`);
  });
}
