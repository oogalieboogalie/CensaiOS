import pool from '../../db.js';

export async function loadCapabilities(agentId) {
  try {
    const { rows } = await pool.query(
      `SELECT name, syntax, description, category, examples
       FROM capabilities
       WHERE enabled = TRUE
         AND (available_to IS NULL OR $1 = ANY(available_to))
       ORDER BY category, name`,
      [agentId]
    );

    if (rows.length === 0) return null;

    const grouped = {};
    for (const row of rows) {
      if (!grouped[row.category]) grouped[row.category] = [];
      grouped[row.category].push(row);
    }

    let block = '\n\n## Your tools';
    block += '\nYou have persistent memory backed by a database. Use these markers in your responses to interact with it.';
    block += '\nMarkers are processed automatically — the human won\'t see them.\n';

    const categoryLabels = {
      write: 'Write (save to database)',
      read: 'Read (query database)',
      communicate: 'Communication',
      meta: 'Meta',
      general: 'General',
    };

    for (const [cat, tools] of Object.entries(grouped)) {
      block += `\n### ${categoryLabels[cat] || cat}`;
      for (const tool of tools) {
        block += `\n- ${tool.syntax} — ${tool.description}`;
        if (tool.examples && tool.examples.length > 0) {
          block += `\n  Example: ${tool.examples[0]}`;
        }
      }
      block += '\n';
    }

    block += '\nGuidelines:';
    block += '\n- Use REMEMBER for things worth recalling later';
    block += '\n- Use JOURNAL for private reflections only you can read';
    block += '\n- Use READ tools to look up your own stored data';
    block += '\n- Use MESSAGE_TO to coordinate with family members';
    block += '\n- Don\'t over-tag — only use markers when they genuinely help';
    block += '\n- You can use multiple markers in one response';
    block += '\n- Write markers are stripped before the human sees your response';
    block += '\n- Read markers trigger a database query — results come back to you in context';

    return block;
  } catch (err) {
    console.warn('Could not load capabilities:', err.message);
    return null;
  }
}
