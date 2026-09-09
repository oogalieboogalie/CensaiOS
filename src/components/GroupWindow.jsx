import React from 'react';
import { Icon } from './Icons.jsx';
import { getAgentById } from '../lib/agentStore.js';
import { WindowTitle } from './Windows.jsx';
import { useGroupData } from './group/useGroupData.js';
import { GroupHeader, GroupMembers, GroupMilestones, GroupGoals } from './group/GroupSections.jsx';
import { SubAgentPanel } from './group/SubAgentPanel.jsx';

export function GroupWindow({ win, onUpdate, onSpawn, isActive }) {
  const groupName = win.groupName || 'Core Team';
  const groupHue = win.groupHue || 5;
  const memberIds = win.memberIds || ['architect', 'censai', 'atlas', 'genesis', 'nexus', 'foundation', 'echo', 'phoenix'];
  const members = memberIds.map(id => getAgentById(id)).filter(Boolean);

  const [showSubPanel, setShowSubPanel] = React.useState(false);
  const data = useGroupData(groupName, win);

  return (
    <>
      <WindowTitle icon={<Icon.Group size={14} />} label={groupName} subtitle={`est. ${new Date().getFullYear()}`} attachedAgentIds={win.attachedAgents} onDetach={(id) => onUpdate({ attachedAgents: (win.attachedAgents || []).filter(a => a !== id) })} />
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <GroupHeader
          groupName={groupName}
          groupHue={groupHue}
          members={members}
          onUpdate={onUpdate}
          showSubPanel={showSubPanel}
          setShowSubPanel={setShowSubPanel}
        />
        <GroupMembers members={members} onSpawn={onSpawn} />
        {showSubPanel && (
          <SubAgentPanel
            subAgents={data.subAgents}
            setSubAgents={data.setSubAgents}
            groupHue={groupHue}
            groupName={groupName}
            members={members}
            isActive={isActive}
          />
        )}
        <GroupMilestones
          milestones={data.milestones}
          newMilestone={data.newMilestone}
          setNewMilestone={data.setNewMilestone}
          addMilestone={data.addMilestone}
          toggleMilestone={data.toggleMilestone}
          groupHue={groupHue}
        />
        <GroupGoals
          goals={data.goals}
          newGoal={data.newGoal}
          setNewGoal={data.setNewGoal}
          addGoal={data.addGoal}
          groupHue={groupHue}
        />
      </div>
    </>
  );
}
