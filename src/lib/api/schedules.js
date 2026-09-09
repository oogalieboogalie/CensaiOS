function workspaceValue(workspaceId) {
  const value = String(workspaceId || '').trim();
  if (!value) throw new Error('Open a workspace before managing schedules.');
  return value;
}

function workspaceParam(workspaceId) {
  return encodeURIComponent(workspaceValue(workspaceId));
}

async function scheduleRequest(url, options, fallback) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || fallback);
  return data;
}

export function getSchedules(workspaceId) {
  return scheduleRequest(
    `/api/schedules?workspaceId=${workspaceParam(workspaceId)}`,
    undefined,
    'Failed to fetch schedules',
  );
}

export function createSchedule(schedule, workspaceId) {
  return scheduleRequest('/api/schedules', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...schedule, workspaceId: workspaceValue(workspaceId) }),
  }, 'Failed to create schedule');
}

export function updateSchedule(id, patch, workspaceId) {
  return scheduleRequest(
    `/api/schedules/${encodeURIComponent(id)}?workspaceId=${workspaceParam(workspaceId)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    },
    'Failed to update schedule',
  );
}

export async function deleteSchedule(id, workspaceId) {
  await scheduleRequest(
    `/api/schedules/${encodeURIComponent(id)}?workspaceId=${workspaceParam(workspaceId)}`,
    { method: 'DELETE' },
    'Failed to delete schedule',
  );
}
