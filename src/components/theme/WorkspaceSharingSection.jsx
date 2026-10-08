import React from 'react';
import { useWorkspaceStore } from '../../lib/store.js';
import { api } from '../../lib/api.js';
import { navigateToWorkspace } from '../../lib/workspace/shareLink.js';
import { GuestLinkManager } from '../guest/GuestLinkManager.jsx';
import { ThemePanelCard } from './ThemeControls.jsx';

export function WorkspaceSharingSection({ navigate = navigateToWorkspace }) {
  const workspaceId = useWorkspaceStore((state) => state.workspaceId);
  const [workspace, setWorkspace] = React.useState(null);
  const [members, setMembers] = React.useState([]);
  const [email, setEmail] = React.useState('');
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

  async function invite(event) {
    event.preventDefault();
    if (!email.trim()) return;
    setState({ status: 'saving', message: '' });
    try {
      const result = await api.inviteWorkspaceMember(workspaceId, email.trim());
      setMembers((current) => {
        const rest = current.filter((member) => member.id !== result.member.id);
        return [...rest, result.member];
      });
      setEmail('');
      setState({
        status: 'ready',
        message: result.alreadyMember
          ? `${result.member.email} already has access.`
          : `${result.member.email} can now open this workspace.`,
      });
    } catch (error) {
      setState({ status: 'error', message: error.message });
    }
  }

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
          {canManage ? 'Send a link to anyone, or invite a teammate who has an account.' : `You joined as a ${workspace?.role || 'member'}.`}
        </div>
      </div>

      {canManage && (
        <form onSubmit={invite} style={{ display: 'flex', gap: 8 }} aria-label="Invite a teammate with an account">
          <input
            aria-label="Registered account email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="teammate@example.com"
            disabled={state.status === 'saving'}
            style={{ minWidth: 0, flex: 1, padding: '9px 10px', borderRadius: 'var(--radius-md)', border: '1px solid var(--hairline)', background: 'var(--surface-2)', color: 'var(--ink)', font: 'inherit' }}
          />
          <button type="submit" disabled={!email.trim() || state.status === 'saving'} style={{ border: 0, borderRadius: 'var(--radius-md)', padding: '9px 12px', background: 'var(--accent)', color: 'var(--surface)', fontWeight: 750, cursor: 'pointer', opacity: !email.trim() || state.status === 'saving' ? 0.5 : 1 }}>
            {state.status === 'saving' ? 'Inviting…' : 'Invite'}
          </button>
        </form>
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
