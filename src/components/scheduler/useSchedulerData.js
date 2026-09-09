import React from 'react';
import { api } from '../../lib/api.js';
import { useVisibilityAwareInterval } from '../../lib/usePolling.js';

export function useSchedulerData(currentProject, isActive, workspaceId) {
  const [schedules, setSchedules] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [schedulesError, setSchedulesError] = React.useState('');
  const [projects, setProjects] = React.useState([]);
  const [projectsLoading, setProjectsLoading] = React.useState(true);
  const [projectsError, setProjectsError] = React.useState('');

  const fetchSchedules = React.useCallback(async (opts = {}) => {
    if (!opts.quiet) setLoading(true);
    setSchedulesError('');
    try {
      const data = await api.getSchedules(workspaceId);
      setSchedules(Array.isArray(data) ? data : []);
    } catch (err) {
      setSchedulesError(err.message || 'Failed to load schedules');
    } finally {
      if (!opts.quiet) setLoading(false);
    }
  }, [workspaceId]);

  const fetchProjects = React.useCallback(async () => {
    setProjectsLoading(true);
    setProjectsError('');
    try {
      const data = await api.getProjects();
      setProjects(Array.isArray(data) ? data : []);
    } catch (err) {
      setProjectsError(err.message || 'Failed to load projects');
    } finally {
      setProjectsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchSchedules();
    fetchProjects();
  }, [currentProject, fetchSchedules, fetchProjects, workspaceId]);

  useVisibilityAwareInterval(() => {
    fetchSchedules({ quiet: true });
  }, 5000, { inactive: !isActive });

  return {
    schedules,
    loading,
    schedulesError,
    setSchedulesError,
    projects,
    projectsLoading,
    projectsError,
    fetchSchedules,
    fetchProjects,
  };
}
