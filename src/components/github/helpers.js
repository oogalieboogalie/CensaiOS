export const getCiStatus = (prDetails, number) => {
  const details = prDetails[number];
  if (!details) return { status: 'loading', text: 'Checking status...' };

  const checkRuns = details.checkRuns?.check_runs || [];
  const statuses = details.statuses || {};
  const combinedState = statuses.state; 
  
  if (combinedState) {
    if (combinedState === 'success') return { status: 'success', text: 'All checks passed' };
    if (combinedState === 'failure' || combinedState === 'error') return { status: 'failure', text: 'Checks failed' };
    return { status: 'pending', text: 'Checks in progress...' };
  }

  if (checkRuns.length === 0) {
    return { status: 'none', text: 'No checks configured' };
  }

  const allCompleted = checkRuns.every(run => run.status === 'completed');
  const anyFailed = checkRuns.some(run => run.conclusion === 'failure' || run.conclusion === 'action_required' || run.conclusion === 'timed_out');
  
  if (anyFailed) return { status: 'failure', text: 'Checks failed' };
  if (allCompleted) return { status: 'success', text: 'All checks passed' };
  return { status: 'pending', text: 'Checks running...' };
};
