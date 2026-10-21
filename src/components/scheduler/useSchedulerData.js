import React from 'react';
import { api } from '../../lib/api.js';
import { logToApp } from '../../lib/appLog/browserLog.js';
import { useVisibilityAwareInterval } from '../../lib/usePolling.js';
import { plainScheduleError, shouldClearScheduleError } from './plainScheduleError.js';

export function useSchedulerData(currentProject, isActive, workspaceId) {
  const [schedules, setSchedules] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [schedulesError, setSchedulesErrorState] = React.useState('');
  const [projects, setProjects] = React.useState([]);
  const [projectsLoading, setProjectsLoading] = React.useState(true);
  const [projectsError, setProjectsError] = React.useState('');
  // A failed list load may clear once the next load works. A delete or save
  // error must survive the quiet refresh that used to wipe it.
  const loadFailed = React.useRef(false);

  const setSchedulesError = React.useCallback((value) => {
    loadFailed.current = false;
    setSchedulesErrorState((current) => {
      const next = typeof value === 'function' ? value(current) : value;
      const plain = plainScheduleError(next);
      if (plain && plain !== String(next ?? '').trim()) {
        logToApp('warn', 'scheduler: hid a database error', { where: 'scheduler' });
      }
      return plain;
    });
  }, []);

  const fetchSchedules = React.useCallback(async (opts = {}) => {
    if (!opts.quiet) setLoading(true);
    try {
      const data = await api.getSchedules(workspaceId);
      setSchedules(Array.isArray(data) ? data : []);
      if (shouldClearScheduleError({ quiet: opts.quiet, loadFailed: loadFailed.current })) {
        setSchedulesError('');
      }
    } catch (err) {
      const plain = plainScheduleError(err.message) || 'Failed to load schedules';
      loadFailed.current = true;
      setSchedulesErrorState(plain);
      logToApp('warn', 'scheduler: could not load schedules', { where: 'scheduler' });
    } finally {
      if (!opts.quiet) setLoading(false);
    }
  }, [workspaceId, setSchedulesError]);

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
