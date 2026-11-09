// Journal entries, saved sign-in tokens, AI keys and a few other rows are
// encrypted with JOURNAL_SECRET or CENSAI_VAULT_SECRET. Those keys live in
// the state volume (generated-secrets.env) or in secrets.json, not in the
// database. Minting a fresh key after that file is lost makes the rows
// permanently unreadable, and nothing used to say so. Startup calls
// assertSafeToMint before it writes either key.

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PROBES = Object.freeze([
  { key: 'journal', table: 'journals', where: "encrypted_content IS NOT NULL AND btrim(encrypted_content) <> ''", label: 'journals' },
  { key: 'journal', table: 'user_api_keys', where: "api_key_encrypted IS NOT NULL AND btrim(api_key_encrypted) <> ''", label: 'saved AI keys' },
  { key: 'journal', table: 'install_identity', where: "private_key_encrypted IS NOT NULL AND btrim(private_key_encrypted) <> ''", label: "this install's signing key" },
  { key: 'journal', table: 'social_follows', where: "key_encrypted IS NOT NULL AND btrim(key_encrypted) <> ''", label: 'social keys' },
  { key: 'journal', table: 'social_showcase', where: "share_token_encrypted IS NOT NULL AND btrim(share_token_encrypted) <> ''", label: 'shared board links' },
  { key: 'vault', table: 'user_tokens', where: "(encrypted_access_token IS NOT NULL AND btrim(encrypted_access_token) <> '') OR (encrypted_refresh_token IS NOT NULL AND btrim(encrypted_refresh_token) <> '')", label: 'saved sign-in tokens' },
  { key: 'vault', table: 'hub_accounts', where: "email_encrypted IS NOT NULL AND btrim(email_encrypted) <> ''", label: 'account email addresses' },
  { key: 'vault', table: 'marketplace_signing_keys', where: "private_key IS NOT NULL AND btrim(private_key) <> ''", label: 'marketplace signing key' },
]);

function lostKeysMessage(keyNames, labels) {
  const keys = keyNames.length === 1
    ? keyNames[0]
    : `${keyNames.slice(0, -1).join(', ')} and ${keyNames.at(-1)}`;
  return `Refusing to generate ${keys}. The database already has encrypted data (${labels.join(', ')}) that only the original key can read. Restore the original key and start again. It is not inside the database dump. Docker keeps it in the state volume as generated-secrets.env. The app on this computer keeps it in secrets.json. Back that file up whenever you back up the database. A new key would leave the encrypted data unreadable.`;
}

export function couldNotCheckError() {
  const err = new Error(
    'Refusing to generate a new JOURNAL_SECRET or CENSAI_VAULT_SECRET because encrypted rows could not be checked. Restore secrets.json (on this computer) or generated-secrets.env (Docker state volume) and start again. Those files are not inside the database dump.',
  );
  err.code = 'CENSAI_KEYS_UNCHECKED';
  return err;
}

async function hasCiphertext(client, probe) {
  if (!/^[a-z_]+$/.test(probe.table)) throw couldNotCheckError();
  const reg = await client.query('SELECT to_regclass($1) AS t', [`public.${probe.table}`]);
  if (!reg.rows[0]?.t) return false;
  const res = await client.query(`SELECT 1 FROM ${probe.table} WHERE ${probe.where} LIMIT 1`);
  return res.rows.length > 0;
}

/**
 * @param {{ query: Function }} client
 * @param {{ journal?: boolean, vault?: boolean }} flags which keys would be minted
 */
export async function assertSafeToMint(client, { journal = false, vault = false } = {}) {
  const found = [];
  for (const probe of PROBES) {
    if (probe.key === 'journal' && !journal) continue;
    if (probe.key === 'vault' && !vault) continue;
    if (await hasCiphertext(client, probe)) found.push(probe);
  }
  if (!found.length) return;
  const keyNames = [];
  if (journal && found.some((probe) => probe.key === 'journal')) keyNames.push('JOURNAL_SECRET');
  if (vault && found.some((probe) => probe.key === 'vault')) keyNames.push('CENSAI_VAULT_SECRET');
  const err = new Error(lostKeysMessage(keyNames, found.map((probe) => probe.label)));
  err.code = 'CENSAI_KEYS_LOST';
  throw err;
}

async function openDatabase() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) return null;
  const { default: pg } = await import('pg');
  // Same wait as freshDatabase.js: Postgres can report healthy a moment
  // before it accepts a connection from this container.
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    const client = new pg.Client({ connectionString });
    try {
      await client.connect();
      return client;
    } catch {
      await client.end().catch(() => {});
      if (attempt === 30) return null;
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
  return null;
}

async function main() {
  const journal = process.argv.includes('--journal');
  const vault = process.argv.includes('--vault');
  if (!journal && !vault) return;
  const client = await openDatabase();
  if (!client) throw couldNotCheckError();
  try {
    await assertSafeToMint(client, { journal, vault });
  } finally {
    await client.end().catch(() => {});
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    const safe = err?.code === 'CENSAI_KEYS_LOST' || err?.code === 'CENSAI_KEYS_UNCHECKED'
      ? err.message
      : couldNotCheckError().message;
    process.stderr.write(`[censaiOS] ${safe}\n`);
    process.exit(1);
  });
}
