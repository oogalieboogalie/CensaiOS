function date(value) {
  return value instanceof Date ? new Date(value) : new Date(String(value));
}

function cloneEvents(events) {
  return events.map((event) => ({
    ...event,
    payload: { ...event.payload },
    created_at: new Date(event.created_at),
  }));
}

class Mutex {
  constructor() {
    this.tail = Promise.resolve();
  }

  async acquire() {
    let release;
    const prior = this.tail;
    this.tail = new Promise((resolve) => { release = resolve; });
    await prior;
    return release;
  }
}

export class FreeTierLedgerDb {
  constructor(now = '2026-07-13T12:00:00.000Z') {
    this.now = date(now);
    this.events = [];
    this.lockKeys = [];
    this.queries = [];
    this.mutex = new Mutex();
    this.sequence = 0;
  }

  async connect() {
    const db = this;
    let unlock;
    let snapshot;
    return {
      async query(sql, values = []) {
        db.queries.push({ sql, values });
        if (sql === 'BEGIN') {
          unlock = await db.mutex.acquire();
          snapshot = cloneEvents(db.events);
          return { rows: [] };
        }
        if (sql === 'COMMIT') {
          unlock?.();
          unlock = null;
          return { rows: [] };
        }
        if (sql === 'ROLLBACK') {
          db.events = snapshot;
          unlock?.();
          unlock = null;
          return { rows: [] };
        }
        if (sql.includes('free-tier:periods')) return db.periods(values[0]);
        if (sql.includes('free-tier:lock')) {
          db.lockKeys.push(values[0]);
          return { rows: [{}] };
        }
        if (sql.includes('free-tier:correlation')) return db.correlation(values[0]);
        if (sql.includes('free-tier:counts')) return db.counts(values);
        if (sql.includes('free-tier:insert')) return db.insert(values);
        throw new Error(`Unexpected fake-ledger query: ${sql}`);
      },
      release() {},
    };
  }

  periods(injectedNow) {
    const nowAt = injectedNow ? date(injectedNow) : date(this.now);
    const dayStart = new Date(Date.UTC(
      nowAt.getUTCFullYear(),
      nowAt.getUTCMonth(),
      nowAt.getUTCDate(),
    ));
    return { rows: [{
      now_at: nowAt,
      day_start: dayStart,
      day_end: new Date(dayStart.valueOf() + 86_400_000),
      minute_start: new Date(nowAt.valueOf() - 60_000),
    }] };
  }

  correlation(correlationId) {
    return { rows: cloneEvents(this.events
      .filter((event) => event.correlation_id === correlationId)
      .sort((left, right) => left.created_at - right.created_at)) };
  }

  counts([userId, dayStartValue, dayEndValue, minuteStartValue, nowValue]) {
    const dayStart = date(dayStartValue);
    const dayEnd = date(dayEndValue);
    const minuteStart = date(minuteStartValue);
    const nowAt = date(nowValue);
    const daily = this.events.filter((event) => (
      event.event_type === 'ai.free_tier.reserved'
      && event.created_at >= dayStart
      && event.created_at < dayEnd
    )).map((reservation) => {
      const related = this.events.filter((event) => (
        event.correlation_id === reservation.correlation_id
      ));
      return {
        actorId: reservation.actor_id,
        consumed: related.some((event) => event.event_type === 'ai.free_tier.consumed'),
        released: related.some((event) => event.event_type === 'ai.free_tier.released'),
      };
    });
    const minute = this.events.filter((event) => (
      event.event_type === 'ai.free_tier.reserved'
      && event.created_at >= minuteStart
      && event.created_at <= nowAt
    ));
    const active = (entry) => !entry.consumed && !entry.released;
    const earliest = minute.reduce((minimum, event) => (
      !minimum || event.created_at < minimum ? event.created_at : minimum
    ), null);
    return { rows: [{
      user_used: daily.filter((entry) => entry.actorId === userId && entry.consumed).length,
      user_reserved: daily.filter((entry) => entry.actorId === userId && active(entry)).length,
      shared_used: daily.filter((entry) => entry.consumed).length,
      shared_reserved: daily.filter(active).length,
      minute_used: minute.length,
      minute_reset_at: earliest ? new Date(earliest.valueOf() + 60_000) : null,
    }] };
  }

  insert([workspaceId, eventType, userId, correlationId, payload, createdAt]) {
    const row = {
      id: String(++this.sequence),
      workspace_id: workspaceId,
      event_type: eventType,
      actor_kind: 'user',
      actor_id: userId,
      correlation_id: correlationId,
      payload: JSON.parse(payload),
      created_at: date(createdAt),
    };
    this.events.push(row);
    return { rows: [cloneEvents([row])[0]] };
  }
}
