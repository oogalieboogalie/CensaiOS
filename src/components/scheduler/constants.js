import { FAMILY_AGENTS } from '../../data/family-agents.js';

export const SCHEDULER_AGENTS = FAMILY_AGENTS;

export const getSelectedDaysString = (daysObj) => {
  if (!daysObj) return '';
  return Object.entries(daysObj)
    .filter(([_, active]) => active)
    .map(([day]) => day.toUpperCase())
    .join(', ');
};
