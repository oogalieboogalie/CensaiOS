import React from 'react';
import { useWorkspaceStore } from '../../lib/store.js';
import { api } from '../../lib/api.js';
import { navigateToWorkspace } from '../../lib/workspace/shareLink.js';
import { GuestLinkManager } from '../guest/GuestLinkManager.jsx';
import { InviteToBoard } from './InviteToBoard.jsx';
import { OpenOnMyDevices } from './OpenOnMyDevices.jsx';
import { SettingsButton, SettingsGroup, SettingsNote, SettingsSection } from './settingsKit.jsx';

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

  const note = state.message
    ? { tone: state.status === 'error' || state.status === 'forbidden' ? 'error' : 'info', text: state.message }
    : null;
  const people = members.length > 0 && (
    <ul data-testid="workspace-member-list" className="hb-set-list" aria-label="People on this board">
      {members.map((member) => (
        <li key={member.id} className="hb-set-item">
          <span className="hb-set-item-main">{member.name ? `${member.name} · ${member.email}` : member.email}</span>
          <span className="hb-set-hint">{member.role}</span>
        </li>
      ))}
    </ul>
  );

  // Anyone but the owner can leave, an admin included.
  const leave = canLeave && (
    <div className="hb-set-actions">
      <SettingsButton onClick={goToPersonalWorkspace} disabled={state.status === 'saving'}>Go to my workspace</SettingsButton>
      <SettingsButton variant="danger" onClick={leaveWorkspace} disabled={state.status === 'saving'}>Leave shared workspace</SettingsButton>
    </div>
  );

  if (!canManage) {
    return (
      <SettingsSection
        title={canLeave ? 'A shared board' : 'Share this board'}
        hint={!workspace ? undefined : canLeave ? `You joined this board as a ${workspace.role}.` : 'Only the board\'s owner or an admin can invite people.'}
        data-testid="workspace-sharing"
      >
        {leave}
        {people && <SettingsGroup title="People on this board">{people}</SettingsGroup>}
        {!workspace && state.status === 'loading' ? <SettingsNote>Loading...</SettingsNote> : null}
        <SettingsNote note={note} />
      </SettingsSection>
    );
  }

  return (
    <>
      {leave && (
        <SettingsSection title="A shared board" hint="You joined this board as an admin." data-testid="workspace-leave">
          {leave}
        </SettingsSection>
      )}
      <SettingsSection title="Share this board" hint="Invite someone by name or email, or make a link anyone can open." data-testid="workspace-sharing">
        <SettingsGroup>
          <InviteToBoard
            workspaceId={workspaceId}
            onMember={(member) => setMembers((current) => [...current.filter((m) => m.id !== member.id), { ...member, role: 'member' }])}
          />
        </SettingsGroup>
        <SettingsGroup>
          <GuestLinkManager workspaceId={workspaceId} />
        </SettingsGroup>
        <SettingsNote note={note} />
      </SettingsSection>
      {people && (
        <SettingsSection title="People on this board" hint="Everyone who can open this board, and what they can do.">
          {people}
        </SettingsSection>
      )}
      <OpenOnMyDevices workspaceId={workspaceId} />
    </>
  );
}
