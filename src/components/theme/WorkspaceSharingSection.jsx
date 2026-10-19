import React from 'react';
import { useWorkspaceStore } from '../../lib/store.js';
import { api } from '../../lib/api.js';
import { navigateToWorkspace } from '../../lib/workspace/shareLink.js';
import { GuestLinkManager } from '../guest/GuestLinkManager.jsx';
import { InviteToBoard } from './InviteToBoard.jsx';
import { ThemePanelCard } from './ThemeControls.jsx';

export function WorkspaceSharingSection({ navigate = navigateToWorkspace }) {
  const workspaceId = useWorkspaceStore((state) => state.workspaceId);
  const [workspace, setWorkspace] = React.useState(null);
  const [members, setMembers] = React.useState([]);
  const [state, setState] = React.useState({ status: 'loading', message: '' });

  const load = React.useCallback(async () => {
    if (!workspaceId) return;
    setState({ status: 'loading', message: '' });
    try {
      const result = await api.getWorkspaceMembers(workspaceId);
      setWorkspace(result.workspace);
      setMembers(result.members || []);
      setState({ status: 'ready', message: '' });
    } catch (error) {
      setState({
        status: error.status === 403 ? 'forbidden' : 'error',
        message: error.status === 403
          ? 'You no longer have access to this workspace.'
          : error.message,
      });
    }
  }, [workspaceId]);

  const canManage = ['owner', 'admin'].includes(workspace?.role);
  const canLeave = Boolean(workspace?.role && workspace.role !== 'owner');

  React.useEffect(() => { load(); }, [load]);

  async function goToPersonalWorkspace() {
    setState({ status: 'saving', message: 'Opening your workspace…' });
    try {
      const result = await api.getPersonalWorkspace();
      navigate(result.workspace.id);
    } catch (error) {
      setState({ status: 'error', message: error.message });
    }
  }

  async function leaveWorkspace() {
    if (!globalThis.confirm?.('Leave this shared workspace? You will need another invitation to return.')) return;
    setState({ status: 'saving', message: 'Leaving shared workspace…' });
    try {
      const result = await api.leaveWorkspace(workspaceId);
      navigate(result.workspace.id);
    } catch (error) {
      setState({ status: 'error', message: error.message });
    }
  }

  return (
    <ThemePanelCard style={{ padding: 14, display: 'grid', gap: 12 }}>
      <div>
        <div style={{ fontSize: 'var(--text-md)', fontWeight: 750, color: 'var(--ink)' }}>{canLeave ? 'Shared workspace access' : 'Share this workspace'}</div>
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-faint)', marginTop: 3 }}>
          {canManage ? 'Invite someone to this board, or send a look-only or edit link.' : `You joined as a ${workspace?.role || 'member'}.`}
        </div>
      </div>

      {canManage && (
        <InviteToBoard
          workspaceId={workspaceId}
          onMember={(member) => setMembers((current) => [...current.filter((m) => m.id !== member.id), { ...member, role: 'member' }])}
        />
      )}

      {canManage && <GuestLinkManager workspaceId={workspaceId} />}

      {state.message && <div role="status" style={{ fontSize: 'var(--text-xs)', color: state.status === 'error' || state.status === 'forbidden' ? 'var(--ps-red)' : 'var(--accent-ink)' }}>{state.message}</div>}

      {canLeave && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <button type="button" onClick={goToPersonalWorkspace} disabled={state.status === 'saving'} style={{ border: '1px solid var(--hairline)', borderRadius: 'var(--radius-md)', padding: '8px 10px', background: 'var(--surface-2)', color: 'var(--ink)', fontWeight: 700, cursor: 'pointer' }}>
            Go to my workspace
          </button>
          <button type="button" onClick={leaveWorkspace} disabled={state.status === 'saving'} style={{ border: '1px solid var(--ps-red)', borderRadius: 'var(--radius-md)', padding: '8px 10px', background: 'transparent', color: 'var(--ps-red)', fontWeight: 700, cursor: 'pointer' }}>
            Leave shared workspace
          </button>
        </div>
      )}

      {members.length > 0 && (
        <div data-testid="workspace-member-list" style={{ display: 'grid', gap: 6 }}>
          {members.map((member) => (
            <div key={member.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '7px 9px', borderRadius: 'var(--radius-md)', background: 'var(--surface-2)', fontSize: 'var(--text-xs)' }}>
              <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{member.name || member.email} · {member.email}</span>
              <span style={{ color: 'var(--ink-faint)' }}>{member.role}</span>
            </div>
          ))}
        </div>
      )}
    </ThemePanelCard>
  );
}
