// read_app_log: the last lines of the app's log for an agent looking into a
// bug. Same rule as GET /api/logs/recent (server/appLog/access.js).
import { readRecentLog } from '../../appLog/readLog.js';
import { canReadAppLog } from '../../appLog/access.js';

export async function handleReadAppLog(args = {}, context = {}, { read = readRecentLog, allowed = canReadAppLog } = {}) {
  if (!(await allowed(context.userId).catch(() => false))) {
    return "Only this computer's owner can read censaiOS's log on this server.";
  }
  const minutes = Number(args.minutes) > 0 ? Number(args.minutes) : 30;
  const lines = Math.min(Number(args.lines) > 0 ? Number(args.lines) : 80, 300);
  const { lines: found, file } = await read({ minutes, lines, level: args.level || 'info', source: args.source, search: args.search });
  if (!file) return 'There is no log file yet: censaiOS has not written one on this computer.';
  if (!found.length) return `Nothing in the log for the last ${minutes} minutes with those filters (file ${file}). Try more minutes or a lower level.`;
  return [`censaiOS log, ${found.length} line(s) from the last ${minutes} minutes (file ${file}, oldest first):`, ...found].join('\n');
}
