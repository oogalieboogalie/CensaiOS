import { calendarTools } from './system/calendar.js';
import { sheetsTools } from './system/sheets.js';
import { postgresTools } from './system/postgres.js';
import { containerTools } from './system/containers.js';
import { devTools } from './system/dev.js';
import { policyTools } from './system/policy.js';

export const systemTools = [
  ...calendarTools,
  ...sheetsTools,
  ...postgresTools,
  ...containerTools,
  ...devTools,
  ...policyTools,
];
