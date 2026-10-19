import React from 'react';
import { getOpenPlans, markPlanTold, stopPlanRun } from '../../lib/api/censaiPlans.js';
import { logToApp } from '../../lib/appLog/browserLog.js';
import { planIsFinished, planIsRunning } from '../../lib/censai/plans.js';
import { useVisibilityAwareInterval } from '../../lib/usePolling.js';

// Censai the orchestrator: watches the person's plans for the pinned chat. While a
// plan runs it looks every few seconds, so each step shows as it happens;
// otherwise now and then, to pick up plans Censai made in a reply. When a
// plan finishes, the first tab to see it posts its one result line
// (onResult) and every other tab leaves it alone.
const RUNNING_MS = 3000;
const IDLE_MS = 30000;

// Same plans at the same stage: keep the old list, so nothing re-renders.
const samePlans = (a, b) => a.length === b.length
  && a.every((plan, i) => plan.id === b[i].id && plan.updatedAt === b[i].updatedAt);

export function usePlanWatch({ workspaceId, onResult }) {
  const [plans, setPlans] = React.useState([]);
  const [stopping, setStopping] = React.useState(null);
  const [stopError, setStopError] = React.useState('');
  const told = React.useRef(new Set());
  const onResultRef = React.useRef(onResult);
  onResultRef.current = onResult;

  const tell = React.useCallback(async (plan) => {
    if (told.current.has(plan.id)) return;
    told.current.add(plan.id);
    try {
      const { first, plan: full } = await markPlanTold({ workspaceId, id: plan.id });
      if (!first) return;
      onResultRef.current?.(full || plan);
      logToApp('info', `censai-orchestrator: plan ${plan.status}, result line shown in the chat`, { where: 'censai-orchestrator' });
    } catch (error) {
      told.current.delete(plan.id);
      logToApp('warn', `censai-orchestrator: could not post a plan's result line (${error.message})`, { where: 'censai-orchestrator' });
    }
  }, [workspaceId]);

  const refresh = React.useCallback(async () => {
    if (!workspaceId) return;
    let open;
    try {
      open = await getOpenPlans({ workspaceId });
    } catch {
      return; // offline or signed out: the next look tries again
    }
    const running = open.filter(planIsRunning);
    setPlans((now) => (samePlans(now, running) ? now : running));
    for (const plan of open.filter(planIsFinished)) await tell(plan);
  }, [workspaceId, tell]);

  React.useEffect(() => { refresh(); }, [refresh]);
  useVisibilityAwareInterval(refresh, plans.length ? RUNNING_MS : IDLE_MS);

  const stop = React.useCallback(async (id) => {
    setStopping(id);
    setStopError('');
    try {
      await stopPlanRun({ workspaceId, id });
      logToApp('info', 'censai-orchestrator: plan stopped from the chat', { where: 'censai-orchestrator' });
    } catch (error) {
      setStopError(`Stop did not go through: ${error.message}`);
      logToApp('warn', `censai-orchestrator: stop did not go through (${error.message})`, { where: 'censai-orchestrator' });
    } finally {
      setStopping(null);
      await refresh();
    }
  }, [workspaceId, refresh]);

  return { plans, refresh, stop, stopping, stopError };
}
