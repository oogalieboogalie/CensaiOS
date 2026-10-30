// The empty board's starting buttons (CanvasLaunchpad.jsx): three windows
// and the ready-made boards. Their names are short so the rows stay easy to
// read; Add (Ctrl+K) finds each window and board by these names too.

// The three still starting points under the welcome line (awe-and-polish
// friction 3); icons, hints and spawn props come from each window's manifest.
export const LAUNCHPAD_STARTS = [
  { kind: 'chat', label: 'Chat with Censai' },
  { kind: 'leadHound', label: 'Find leads' },
  { kind: 'marketplace', label: 'Browse modules' },
];

// Ready-made boards a newcomer can start from (spec 7); each opens the
// template dialog on that board.
export const LAUNCHPAD_BOARDS = [
  { id: 'developer', label: 'Developer' },
  { id: 'code-workspace', label: 'Code Workspace' },
  { id: 'creative-studio', label: 'Creative Studio' },
  { id: 'agent-team', label: 'Agent Team' },
  { id: 'small-business', label: 'Small Business' },
  { id: 'real-estate-team', label: 'Real Estate' },
];
