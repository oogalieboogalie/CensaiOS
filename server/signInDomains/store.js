// Who can sign up: email domains an admin lets in (docker/094-sign-in-domains.sql).
// The sign-in checks in server/security/authPolicy.js are synchronous, so the
// list is kept in memory: loaded at start-up (./schema.js) and after every change here.

// Mail that anyone can get. Letting one of these in would open sign-up to everyone.
export const PUBLIC_MAIL_DOMAINS = Object.freeze(new Set([
  'gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com', 'msn.com',
  'yahoo.com', 'ymail.com', 'icloud.com', 'me.com', 'mac.com', 'aol.com',
  'proton.me', 'protonmail.com', 'pm.me', 'gmx.com', 'gmx.net', 'mail.com',
  'zoho.com', 'yandex.com', 'yandex.ru', 'qq.com', '163.com', 'hey.com', 'fastmail.com',
]));

const DOMAIN = /^(?=.{3,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

let current = new Set();

function refusal(message) {
  return Object.assign(new Error(message), { statusCode: 400 });
}

/** "@Censai.App", "censai.app" or "someone@censai.app" -> "censai.app"; throws a 400 otherwise. */
export function normalizeDomain(value) {
  let text = String(value ?? '').trim().toLowerCase();
  if (text.includes('@')) text = text.slice(text.lastIndexOf('@') + 1);
  text = text.replace(/\.$/, '');
  if (!DOMAIN.test(text)) throw refusal('Type a domain like censai.app.');
  if (PUBLIC_MAIL_DOMAINS.has(text)) {
    throw refusal(`Anyone can get an @${text} address, so it would let everyone sign up. Add their email to the server's ALLOWED_USERS instead.`);
  }
  return text;
}

/** The domain part of an email, lower case, or '' when there is none. */
export function emailDomain(email) {
  const text = String(email || '').trim().toLowerCase();
  const at = text.lastIndexOf('@');
  return at > 0 ? text.slice(at + 1) : '';
}

/** The domains in memory right now (what the sign-in checks use). */
export function currentSignInDomains() {
  return current;
}

export async function listSignInDomains(db) {
  const { rows } = await db.query(
    `SELECT d.domain, d.added_at AS "addedAt", u.name AS "addedByName", u.email AS "addedByEmail"
       FROM sign_in_domains d LEFT JOIN users u ON u.id = d.added_by
      ORDER BY d.domain`,
  );
  current = new Set(rows.map((row) => row.domain));
  return rows;
}

export async function addSignInDomain(db, value, userId) {
  const domain = normalizeDomain(value);
  await db.query(
    'INSERT INTO sign_in_domains (domain, added_by) VALUES ($1, $2) ON CONFLICT (domain) DO NOTHING',
    [domain, userId || null],
  );
  await listSignInDomains(db);
  return domain;
}

export async function removeSignInDomain(db, value) {
  const domain = String(value ?? '').trim().toLowerCase();
  const { rowCount } = await db.query('DELETE FROM sign_in_domains WHERE domain = $1', [domain]);
  await listSignInDomains(db);
  return rowCount > 0;
}

export const __test__ = {
  setCurrent(list) { current = new Set(list); },
};
