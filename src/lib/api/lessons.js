// Live lessons (spec 12): the instructor's classroom and the student's seat.
import { shareRequest } from './shareLinks.js';

const id = encodeURIComponent;

export function listClasses(workspaceId) {
  return shareRequest(`/api/workspaces/${id(workspaceId)}/classes`);
}

export function createClass(workspaceId, input) {
  return shareRequest(`/api/workspaces/${id(workspaceId)}/classes`, { method: 'POST', body: input });
}

export function getClassRoster(classId) {
  return shareRequest(`/api/classes/${id(classId)}/roster`);
}

export function createClassInviteCodes(classId, count = 1) {
  return shareRequest(`/api/classes/${id(classId)}/invite-codes`, { method: 'POST', body: { count } });
}

export function reviewCheckpoint(classId, enrollmentId, checkpointId, body) {
  return shareRequest(`/api/classes/${id(classId)}/students/${id(enrollmentId)}/checkpoints/${id(checkpointId)}`, { method: 'POST', body });
}

export function lowerStudentHand(classId, enrollmentId) {
  return shareRequest(`/api/classes/${id(classId)}/students/${id(enrollmentId)}/hand`, { method: 'POST', body: { raised: false } });
}

export function removeStudent(classId, enrollmentId) {
  return shareRequest(`/api/classes/${id(classId)}/students/${id(enrollmentId)}/remove`, { method: 'POST', body: {} });
}

export function endClass(classId) {
  return shareRequest(`/api/classes/${id(classId)}/end`, { method: 'POST', body: {} });
}

export function previewClass(token) {
  return shareRequest(`/api/guest/classes/${id(token)}`);
}

export function joinClass(token, body) {
  return shareRequest(`/api/guest/classes/${id(token)}/join`, { method: 'POST', body });
}

export function rejoinClass(token, rejoinToken) {
  return shareRequest(`/api/guest/classes/${id(token)}/rejoin`, { method: 'POST', body: { rejoinToken } });
}

export function getMyClass() {
  return shareRequest('/api/guest/classes/me/state');
}

export function tickCheckpoint(checkpointId, done) {
  return shareRequest(`/api/guest/classes/me/checkpoints/${id(checkpointId)}`, { method: 'POST', body: { done } });
}

export function raiseClassHand(raised) {
  return shareRequest('/api/guest/classes/me/hand', { method: 'POST', body: { raised } });
}
