// Comment pins (spec 5). One store shared by the owner's board and the
// guest board; `configure` picks which API the current person talks to.
// Comments arrive live as `comment.upsert` events on the collaboration
// socket, so every open board converges without polling.
import { create } from 'zustand';
import { api } from '../api.js';

function sortByTime(list) {
  return [...list].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
}

export function mergeComment(list, comment) {
  if (!comment?.id) return list;
  const index = list.findIndex((entry) => entry.id === comment.id);
  if (index < 0) return sortByTime([...list, comment]);
  const next = list.slice();
  next[index] = { ...next[index], ...comment };
  return next;
}

/** Root comments with their replies, newest activity last. */
export function threadsOf(comments) {
  const roots = comments.filter((comment) => !comment.threadId);
  return roots.map((root) => ({
    ...root,
    replies: comments.filter((comment) => comment.threadId === root.id),
  }));
}

export const useCommentStore = create((set, get) => ({
  mode: null,
  workspaceId: null,
  comments: [],
  agents: [],
  canComment: false,
  status: 'idle',
  error: '',
  tool: false,
  panelOpen: false,
  openThreadId: null,
  draft: null,

  configure: ({ mode, workspaceId }) => {
    const current = get();
    if (current.mode === mode && current.workspaceId === workspaceId) return;
    set({ mode, workspaceId, comments: [], agents: [], status: 'idle', openThreadId: null, draft: null });
  },

  load: async () => {
    const { mode, workspaceId } = get();
    if (!mode || (mode === 'member' && !workspaceId)) return;
    set({ status: 'loading', error: '' });
    try {
      const result = mode === 'guest' ? await api.listGuestComments() : await api.listBoardComments(workspaceId);
      set({
        comments: sortByTime(result.comments || []),
        agents: result.agents || [],
        canComment: Boolean(result.canComment),
        status: 'ready',
      });
    } catch (error) {
      set({ status: 'error', error: error.message });
    }
  },

  upsert: (comment) => set((state) => ({ comments: mergeComment(state.comments, comment) })),

  post: async (input) => {
    const { mode, workspaceId } = get();
    const result = mode === 'guest' ? await api.postGuestComment(input) : await api.postBoardComment(workspaceId, input);
    get().upsert(result.comment);
    return result.comment;
  },

  resolve: async (commentId, resolved = true) => {
    const { mode, workspaceId } = get();
    const result = mode === 'guest'
      ? await api.resolveGuestComment(commentId, resolved)
      : await api.resolveBoardComment(workspaceId, commentId, resolved);
    get().upsert(result.comment);
    return result.comment;
  },

  setTool: (tool) => set({ tool: Boolean(tool), ...(tool ? { panelOpen: true } : {}) }),
  setPanelOpen: (panelOpen) => set({ panelOpen: Boolean(panelOpen), ...(panelOpen ? {} : { tool: false, draft: null }) }),
  openThread: (openThreadId) => set({ openThreadId, panelOpen: true, draft: null }),
  setDraft: (draft) => set({ draft, tool: false, panelOpen: true, openThreadId: null }),
}));
