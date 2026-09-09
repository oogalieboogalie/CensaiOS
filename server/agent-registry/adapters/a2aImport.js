import crypto from 'crypto';
import pool from '../../db.js';
import { inspectA2ACard, A2AAdapterError } from './a2aCard.js';
import { assertA2AEgressUrl, createA2AGuardedFetch } from './egress.js';

const MAX_REDIRECTS = 3;
const MAX_BODY_BYTES = 256_000;
const FETCH_TIMEOUT_MS = 10_000;

async function readBoundedBody(response) {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    await response.body?.cancel?.().catch(() => {});
    throw new A2AAdapterError('A2A Agent Card response is too large.', 'A2A_CARD_SIZE_INVALID');
  }
  if (!response.body?.getReader) {
    const text = await response.text();
    if (Buffer.byteLength(text) > MAX_BODY_BYTES) {
      throw new A2AAdapterError('A2A Agent Card response is too large.', 'A2A_CARD_SIZE_INVALID');
    }
    return text;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new A2AAdapterError('A2A Agent Card response is too large.', 'A2A_CARD_SIZE_INVALID');
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function discardBody(response) {
  await response.body?.cancel?.().catch(() => {});
}

function jsonContentType(response) {
  const value = String(response.headers.get('content-type') || '').toLowerCase();
  return value.includes('application/json') || value.includes('+json');
}

export async function fetchA2AImport(cardUrl, options = {}) {
  const guardedFetch = options.guardedFetch || createA2AGuardedFetch(options);
  let current = await assertA2AEgressUrl(cardUrl, options);
  const requestedCardUrl = current.toString();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs || FETCH_TIMEOUT_MS);
  try {
    for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
      let response;
      try {
        response = await guardedFetch(current, {
          method: 'GET',
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        });
      } catch (error) {
        if (error?.name === 'AbortError') {
          throw new A2AAdapterError('A2A Agent Card request timed out.', 'A2A_FETCH_TIMEOUT', 504);
        }
        if (error instanceof A2AAdapterError) throw error;
        throw new A2AAdapterError('A2A Agent Card could not be fetched.', 'A2A_FETCH_FAILED', 502);
      }
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        await discardBody(response);
        if (redirects === MAX_REDIRECTS) {
          throw new A2AAdapterError('A2A Agent Card redirected too many times.', 'A2A_REDIRECT_LIMIT');
        }
        const location = response.headers.get('location');
        if (!location) throw new A2AAdapterError('A2A redirect omitted Location.', 'A2A_REDIRECT_INVALID');
        current = await assertA2AEgressUrl(new URL(location, current), options);
        continue;
      }
      if (!response.ok) {
        await discardBody(response);
        throw new A2AAdapterError(`A2A Agent Card returned HTTP ${response.status}.`,
          'A2A_FETCH_FAILED', 502);
      }
      if (!jsonContentType(response)) {
        await discardBody(response);
        throw new A2AAdapterError('A2A Agent Card response must be JSON.', 'A2A_CONTENT_TYPE_INVALID');
      }
      let raw;
      try { raw = JSON.parse(await readBoundedBody(response)); }
      catch (error) {
        if (error instanceof A2AAdapterError) throw error;
        throw new A2AAdapterError('A2A Agent Card response is not valid JSON.');
      }
      const inspected = inspectA2ACard(raw, { cardUrl: requestedCardUrl });
      await assertA2AEgressUrl(inspected.endpoint, options);
      return { ...inspected, resolvedCardUrl: current.toString() };
    }
    throw new A2AAdapterError('A2A Agent Card import failed.', 'A2A_FETCH_FAILED');
  } finally {
    clearTimeout(timer);
  }
}

function importedCardId(workspaceId, cardUrl) {
  const digest = crypto.createHash('sha256').update(`${workspaceId}\0${cardUrl}`).digest('hex');
  return `ext:a2a:${digest.slice(0, 32)}`;
}

function importMetadata(inspected) {
  const executor = {
    kind: 'a2a',
    status: inspected.executable ? 'executable' : 'unsupported',
    protocolVersion: inspected.protocolVersion,
    transport: 'JSONRPC',
    endpoint: inspected.endpoint,
    sourceDigest: inspected.sourceDigest,
    sourceCard: inspected.sourceCard,
    ...(inspected.reason ? { reason: inspected.reason } : {}),
  };
  return {
    import: {
      kind: 'a2a', cardUrl: inspected.cardUrl, sourceDigest: inspected.sourceDigest,
      resolvedCardUrl: inspected.resolvedCardUrl || inspected.cardUrl,
      fetchedAt: new Date().toISOString(),
    },
    executor,
  };
}

export async function upsertA2AImport({
  db = pool, workspaceId, userId, inspected,
}) {
  const id = importedCardId(String(workspaceId), inspected.cardUrl);
  const metadata = importMetadata(inspected);
  const { rows } = await db.query(
    `INSERT INTO agent_cards
       (id, name, description, version, skills, endpoint, auth, owner_id, workspace_id, visibility, metadata)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, '{"type":"none"}'::jsonb, $7, $8, 'workspace', $9::jsonb)
     ON CONFLICT (id) DO UPDATE SET
       name=EXCLUDED.name, description=EXCLUDED.description, version=EXCLUDED.version,
       skills=EXCLUDED.skills, endpoint=EXCLUDED.endpoint, auth=EXCLUDED.auth,
       visibility='workspace', metadata=EXCLUDED.metadata, updated_at=NOW(), deleted_at=NULL
     WHERE agent_cards.workspace_id=EXCLUDED.workspace_id
       AND agent_cards.metadata->'import'->>'kind'='a2a'
       AND agent_cards.metadata->'import'->>'cardUrl'=EXCLUDED.metadata->'import'->>'cardUrl'
     RETURNING *, (xmax = 0) AS imported_created`,
    [id, inspected.name, inspected.description, inspected.version,
      JSON.stringify(inspected.skills), inspected.endpoint, String(userId), String(workspaceId),
      JSON.stringify(metadata)]
  );
  if (!rows[0]) {
    throw new A2AAdapterError('Agent Card import identity conflicts with an existing card.',
      'A2A_IMPORT_CONFLICT', 409);
  }
  const card = rows[0];
  const created = card.imported_created === true || card.imported_created === 'true';
  delete card.imported_created;
  return { card, created };
}

export const __test__ = { importedCardId, importMetadata };
