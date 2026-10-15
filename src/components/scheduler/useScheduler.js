import { useSchedulerData } from './useSchedulerData.js';
import { useSchedulerFormState } from './useSchedulerFormState.js';
import { useSchedulerActions } from './useSchedulerActions.js';
import { useWorkspaceStore } from '../../lib/store.js';

export function useScheduler(currentProject, isActive) {
  const workspaceId = useWorkspaceStore(state => state.workspaceId);
  const data = useSchedulerData(currentProject, isActive, workspaceId);
  const formState = useSchedulerFormState();
  const actions = useSchedulerActions(data, formState, currentProject, workspaceId);
  return { ...data, ...formState, ...actions };
}
