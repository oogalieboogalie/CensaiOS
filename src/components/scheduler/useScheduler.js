import React from 'react';
import { useSchedulerData } from './useSchedulerData.js';
import { useSchedulerFormState } from './useSchedulerFormState.js';
import { useSchedulerActions } from './useSchedulerActions.js';
import { useWorkspaceStore } from '../../lib/store.js';

export function useScheduler(currentProject, isActive) {
  const workspaceId = useWorkspaceStore(state => state.workspaceId);
  const data = useSchedulerData(currentProject, isActive, workspaceId);
  const formState = useSchedulerFormState();
  const actions = useSchedulerActions(data, formState, currentProject, workspaceId);

  const groupedTimeline = React.useMemo(() => {
    const groups = {};
    data.schedules.forEach(s => {
      let dayName = 'Future Tasks';
      try {
        // Postgres DATE columns arrive as full ISO timestamps; keep the day part.
        const dateObj = new Date(String(s.scheduled_date || '').slice(0, 10) + 'T00:00:00');
        if (Number.isNaN(dateObj.getTime())) throw new Error('no date');
        const formattedDate = dateObj.toLocaleDateString('en-US', { weekday: 'long', month: 'numeric', day: 'numeric' });
        const parts = formattedDate.split(', ');
        dayName = parts.length > 1 ? `${parts[0]} - ${parts[1]}` : formattedDate;
      } catch (e) {
        dayName = s.scheduled_date;
      }
      if (!groups[dayName]) groups[dayName] = [];
      groups[dayName].push(s);
    });

    return Object.entries(groups).sort((a, b) => {
      const dateA = new Date(a[1][0]?.scheduled_date || '');
      const dateB = new Date(b[1][0]?.scheduled_date || '');
      return dateB - dateA;
    });
  }, [data.schedules]);

  return {
    ...data,
    ...formState,
    ...actions,
    groupedTimeline
  };
}
