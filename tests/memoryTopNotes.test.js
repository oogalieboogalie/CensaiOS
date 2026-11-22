// The notes carried in an agent's instructions: the newest keep a third of the
// places, so a pile of old notes cannot keep every new one out.
import { MEMORY_ORDER_SQL, recentPlaces, topNotesSql } from '../server/memory/scoring.js';

test('the newest notes get a third of the places', () => {
  expect(recentPlaces(15)).toBe(5);
  expect(recentPlaces(4)).toBe(2);
  expect(recentPlaces(1)).toBe(1);
  expect(recentPlaces(0)).toBe(0);
  expect(recentPlaces(undefined)).toBe(0);
});

test('newest first, then by importance, inside the notes the caller picked', () => {
  const sql = topNotesSql('agent_id = $1 AND workspace_id = $3');
  expect(sql).toMatch(/row_number\(\) OVER \(ORDER BY created_at DESC, id DESC\) AS newest\s+FROM memories WHERE agent_id = \$1 AND workspace_id = \$3/);
  expect(MEMORY_ORDER_SQL).toBe('importance');
  expect(sql).toMatch(/ORDER BY \(newest <= \$4\) DESC, importance DESC, last_accessed DESC LIMIT \$2/);
});
