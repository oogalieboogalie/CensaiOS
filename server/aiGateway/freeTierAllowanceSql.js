const ALLOWANCE_EVENT_TYPES = [
  'ai.free_tier.reserved',
  'ai.free_tier.consumed',
  'ai.free_tier.released',
];

function asIso(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.valueOf())) throw new TypeError('Postgres returned an invalid allowance timestamp');
  return date.toISOString();
}

export async function resolveAllowancePeriods(client, now = null) {
  const result = await client.query(`/* free-tier:periods */
    WITH instant AS (
      SELECT COALESCE($1::timestamptz, clock_timestamp()) AS now_at
    ), period AS (
      SELECT now_at,
        date_trunc('day', now_at AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AS day_start
      FROM instant
    )
    SELECT now_at, day_start, day_start + INTERVAL '1 day' AS day_end,
      now_at - INTERVAL '1 minute' AS minute_start
    FROM period`, [now]);
  const row = result.rows[0];
  return {
    now: asIso(row.now_at),
    dayStart: asIso(row.day_start),
    dayEnd: asIso(row.day_end),
    minuteStart: asIso(row.minute_start),
  };
}

export async function acquireAllowanceLocks(client, lockKeys) {
  const orderedKeys = [...new Set(lockKeys)].sort();
  for (const lockKey of orderedKeys) {
    await client.query(
      '/* free-tier:lock */ SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      [lockKey],
    );
  }
  return orderedKeys;
}

export async function readCorrelationEvents(client, correlationId) {
  const result = await client.query(`/* free-tier:correlation */
    SELECT workspace_id, actor_id, event_type, payload, created_at
    FROM workspace_events
    WHERE correlation_id = $1::uuid AND event_type = ANY($2::text[])
    ORDER BY created_at ASC, id ASC`, [correlationId, ALLOWANCE_EVENT_TYPES]);
  return result.rows;
}

export async function readAllowanceCounts(client, periods, userId) {
  const result = await client.query(`/* free-tier:counts */
    WITH daily AS (
      SELECT r.actor_id, r.correlation_id,
        EXISTS (
          SELECT 1 FROM workspace_events t
          WHERE t.correlation_id = r.correlation_id
            AND t.event_type = 'ai.free_tier.consumed'
        ) AS consumed,
        EXISTS (
          SELECT 1 FROM workspace_events t
          WHERE t.correlation_id = r.correlation_id
            AND t.event_type = 'ai.free_tier.released'
        ) AS released
      FROM workspace_events r
      WHERE r.event_type = 'ai.free_tier.reserved'
        AND r.created_at >= $2::timestamptz AND r.created_at < $3::timestamptz
    ), minute_attempts AS (
      SELECT created_at FROM workspace_events
      WHERE event_type = 'ai.free_tier.reserved'
        AND created_at >= $4::timestamptz AND created_at <= $5::timestamptz
    )
    SELECT
      COUNT(*) FILTER (WHERE actor_id = $1 AND consumed)::int AS user_used,
      COUNT(*) FILTER (WHERE actor_id = $1 AND NOT consumed AND NOT released)::int
        AS user_reserved,
      COUNT(*) FILTER (WHERE consumed)::int AS shared_used,
      COUNT(*) FILTER (WHERE NOT consumed AND NOT released)::int AS shared_reserved,
      (SELECT COUNT(*)::int FROM minute_attempts) AS minute_used,
      (SELECT MIN(created_at) + INTERVAL '1 minute' FROM minute_attempts) AS minute_reset_at
    FROM daily`, [
    String(userId), periods.dayStart, periods.dayEnd, periods.minuteStart, periods.now,
  ]);
  const row = result.rows[0];
  return {
    userUsed: Number(row.user_used),
    userReserved: Number(row.user_reserved),
    sharedUsed: Number(row.shared_used),
    sharedReserved: Number(row.shared_reserved),
    minuteUsed: Number(row.minute_used),
    minuteResetAt: row.minute_reset_at ? asIso(row.minute_reset_at) : periods.now,
  };
}

export async function insertAllowanceEvent(client, event) {
  const result = await client.query(`/* free-tier:insert */
    INSERT INTO workspace_events
      (workspace_id, event_type, actor_kind, actor_id, correlation_id, payload, created_at)
    VALUES ($1, $2, 'user', $3, $4::uuid, $5::jsonb, $6::timestamptz)
    RETURNING workspace_id, actor_id, event_type, payload, created_at`, [
    event.workspaceId,
    event.eventType,
    String(event.userId),
    event.correlationId,
    JSON.stringify(event.payload),
    event.createdAt,
  ]);
  return result.rows[0];
}
