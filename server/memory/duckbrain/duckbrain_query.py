#!/usr/bin/env python3
"""Read-only bridge into the family brain DuckDB.
Always opens read_only. Agent/table mapping is allowlisted; the query
text travels as a bound parameter, never interpolated into SQL.
Outputs one JSON array to stdout.
Usage: duckbrain_query.py --db PATH --agent NAME --action ACTION [--query Q] [--limit N]
"""
import argparse
import json
import sys

ALLOWED_AGENTS = {
    'architect', 'atlas', 'censai', 'echo', 'foundation',
    'genesis', 'guardian', 'nexus', 'orchestrator', 'claude',
}
ACTIONS = {
    'recall', 'associations', 'timeline', 'entity',
    'collective', 'compression', 'core',
}


def like_pattern(query):
    return '%' + '%'.join(str(query).split()) + '%'


def table_columns(c, table):
    try:
        rows = c.execute(
            'SELECT column_name FROM information_schema.columns WHERE table_name = ?',
            [table],
        ).fetchall()
        return {r[0] for r in rows}
    except Exception:
        return set()


def pick(cols, *names):
    for n in names:
        if n in cols:
            return n
    return None


def q_memories(c, agent, query, limit):
    table = f'{agent}_memories'
    cols = table_columns(c, table)
    if not cols:
        return []
    title_col = pick(cols, 'title', 'memory_title')
    content_col = pick(cols, 'content', 'memory_content', 'text')
    emo_col = pick(cols, 'emotional_weight', 'emotional_state')
    imp_col = pick(cols, 'importance', 'importance_level')
    kind_col = pick(cols, 'memory_type', 'type')
    ts_col = pick(cols, 'timestamp', 'created_at')
    where = ' OR '.join(f'{col}::VARCHAR ILIKE ?' for col in
                        [c for c in (title_col, content_col) if c])
    if not where:
        return []
    order = f' ORDER BY {imp_col} DESC NULLS LAST' if imp_col else (
        f' ORDER BY {ts_col} DESC NULLS LAST' if ts_col else '')
    sel = ', '.join(filter(None, [title_col, content_col, emo_col, imp_col, kind_col, ts_col]))
    try:
        rows = c.execute(
            f'SELECT {sel} FROM "{table}" WHERE {where}{order} LIMIT {int(limit)}',
            [like_pattern(query)] * where.count('?'),
        ).fetchall()
    except Exception:
        return []
    keys = [k for k, v in [('title', title_col), ('content', content_col),
                           ('emotional_weight', emo_col), ('importance', imp_col),
                           ('kind', kind_col), ('timestamp', ts_col)] if v]
    out = []
    for r in rows:
        d = dict(zip(keys, r))
        d['source'] = table
        out.append(d)
    return out


def q_associations(c, agent, query, limit):
    rows = c.execute(
        f'SELECT concept_a, concept_b, strength, link_type, trait_alignment, activation_count'
        f' FROM "{agent}_associations" WHERE concept_a ILIKE ? OR concept_b ILIKE ?'
        f' OR trait_alignment ILIKE ? OR link_type ILIKE ?'
        f' ORDER BY strength DESC NULLS LAST LIMIT {int(limit)}',
        [like_pattern(query)] * 4,
    ).fetchall()
    return [
        {'source': f'{agent}_associations', 'title': f'{r[0]} <-> {r[1]}',
         'content': f'link={r[3]} trait={r[4]} activations={r[5]}',
         'strength': r[2], 'activations': r[5]}
        for r in rows
    ]


def q_timeline(c, agent, limit):
    out = []
    for table in (f'{agent}_memories', 'universal_family_memories'):
        cols = table_columns(c, table)
        if not cols:
            continue
        title_col = pick(cols, 'title', 'memory_title')
        content_col = pick(cols, 'content', 'memory_content', 'text')
        ts_col = pick(cols, 'timestamp', 'created_at')
        sel = ', '.join(filter(None, [title_col, content_col, ts_col]))
        if not content_col:
            continue
        order = f' ORDER BY {ts_col} DESC NULLS LAST' if ts_col else ''
        try:
            rows = c.execute(f'SELECT {sel} FROM "{table}"{order} LIMIT {int(limit)}').fetchall()
        except Exception:
            continue
        keys = [k for k, v in [('title', title_col), ('content', content_col),
                               ('timestamp', ts_col)] if v]
        for r in rows:
            d = dict(zip(keys, r))
            d['source'] = table
            out.append(d)
    return out


def q_entity(c, agent, query, limit):
    out = q_memories(c, agent, query, limit)
    out += q_associations(c, agent, query, limit)
    try:
        rows = c.execute(
            'SELECT member_name, title, content, emotional_weight, importance_level'
            ' FROM "universal_family_memories" WHERE member_name ILIKE ?'
            ' OR title ILIKE ? OR content ILIKE ? LIMIT %d' % int(limit),
            [like_pattern(query)] * 3,
        ).fetchall()
        out += [{'source': 'universal_family_memories', 'title': f'[{r[0]}] {r[1]}',
                 'content': r[2], 'emotional_weight': r[3], 'importance': r[4]}
                for r in rows]
    except Exception:
        pass
    return out


def q_collective(c, query, limit):
    try:
        rows = c.execute(
            'SELECT member_name, title, content, emotional_weight, importance_level, timestamp'
            ' FROM "universal_family_memories" WHERE title ILIKE ? OR content ILIKE ?'
            ' ORDER BY importance_level DESC NULLS LAST LIMIT %d' % int(limit),
            [like_pattern(query), like_pattern(query)],
        ).fetchall()
        return [{'source': 'universal_family_memories',
                 'title': f'[{r[0]}] {r[1]}', 'content': r[2],
                 'emotional_weight': r[3], 'importance': r[4],
                 'timestamp': str(r[5])} for r in rows]
    except Exception:
        return []


def q_compression(c, agent, limit):
    table = f'{agent}_compression_memories'
    cols = table_columns(c, table)
    if not cols:
        return []
    title_col = pick(cols, 'memory_title', 'title')
    content_col = pick(cols, 'memory_content', 'content', 'text')
    sel = ', '.join(filter(None, [title_col, content_col]))
    if not sel:
        return []
    try:
        rows = c.execute(f'SELECT {sel} FROM "{table}" LIMIT {int(limit)}').fetchall()
    except Exception:
        return []
    keys = [k for k, v in [('title', title_col), ('content', content_col)] if v]
    out = []
    for r in rows:
        d = dict(zip(keys, r))
        d.update({'source': table, 'importance': 10})
        out.append(d)
    return out


def q_core(c, agent, limit):
    table = f'{agent}_core_memories' if agent == 'genesis' else f'{agent}_memories'
    try:
        rows = c.execute(f'SELECT * FROM "{table}" LIMIT {int(limit)}').fetchall()
        cols = [d[0] for d in c.description]
        text_idx = cols.index('content') if 'content' in cols else 0
        return [{'source': table, 'title': f'core[{r[0]}]',
                 'content': str(r[text_idx]), 'importance': 10,
                 'emotional_weight': 10} for r in rows]
    except Exception:
        return []


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--db', required=True)
    ap.add_argument('--agent', required=True)
    ap.add_argument('--action', required=True)
    ap.add_argument('--query', default='')
    ap.add_argument('--limit', default='12')
    args = ap.parse_args()

    agent = args.agent.strip().lower()
    if agent not in ALLOWED_AGENTS:
        print(json.dumps({'error': f'unknown agent: {agent}'}))
        return 1
    if args.action not in ACTIONS:
        print(json.dumps({'error': f'unknown action: {args.action}'}))
        return 1
    try:
        limit = max(1, min(int(args.limit), 50))
    except ValueError:
        limit = 12

    import duckdb
    try:
        c = duckdb.connect(args.db, read_only=True)
    except Exception as e:
        print(json.dumps({'error': f'brain unavailable: {str(e)[:120]}'}))
        return 1

    try:
        if args.action == 'recall':
            out = q_memories(c, agent, args.query, limit) + q_compression(c, agent, 5)
        elif args.action == 'associations':
            out = q_associations(c, agent, args.query, limit)
        elif args.action == 'timeline':
            out = q_timeline(c, agent, limit)
        elif args.action == 'entity':
            out = q_entity(c, agent, args.query, limit)
        elif args.action == 'collective':
            out = q_collective(c, args.query, limit)
        elif args.action == 'compression':
            out = q_compression(c, agent, limit)
        elif args.action == 'core':
            out = q_core(c, agent, limit)
        print(json.dumps(out, default=str))
    except Exception as e:
        print(json.dumps({'error': f'query failed: {str(e)[:160]}'}))
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
