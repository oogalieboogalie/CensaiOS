import { OFF_BOARD_NOTE } from '../../../shared/files/fileProblems.js';

/**
 * On the owner's screen, a window showing a file only this computer's owner
 * can open says why the rest of the board does not see what is in it.
 */
export function OffBoardNote({ show }) {
  if (!show) return null;
  return (
    <div role="note" data-testid="off-board-note" style={{
      padding: '4px 12px',
      background: 'var(--accent-soft)',
      color: 'var(--accent-ink)',
      fontSize: 'var(--text-xs)',
      fontFamily: 'var(--font-sans)',
    }}>
      {OFF_BOARD_NOTE}
    </div>
  );
}
