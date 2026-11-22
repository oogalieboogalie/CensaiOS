// The version number people see (such as 0.7.1358) and the note that says an
// update went in. The updater works the number out; the server passes it on in
// /api/app-update as `version`, and the last update's patch notes as `updated`.
import React from 'react';
import { appUpdateApi } from './api.js';
import { DEMO } from '../demo/demoMode.js';

const SEEN_KEY = 'censai.update.seenVersion';
const ASK_EVERY_MS = 5 * 60_000;

/** "censaiOS 0.7.1358", or nothing when this copy has no number. */
export const versionLabel = (version) => (version ? `censaiOS ${version}` : '');

function readSeen(storage) {
  try { return storage?.getItem(SEEN_KEY) || ''; } catch { return ''; /* quiet: storage can be blocked, then the note shows again */ }
}

/** The update the person has not been told about yet, or null. */
export function unseenUpdate(status, storage = globalThis.localStorage) {
  const updated = status?.updated;
  if (!updated?.version || updated.version !== status?.version) return null;
  return readSeen(storage) === updated.version ? null : updated;
}

/** The person read the note: it does not come back for this version. */
export function markUpdateSeen(version, storage = globalThis.localStorage) {
  try { storage?.setItem(SEEN_KEY, version); } catch { /* quiet: storage can be blocked, then the note shows again */ }
}

/** "Updated from 0.7.1358 with 2 changes." */
export function updateSummary(updated) {
  const n = updated?.changes?.length || 0;
  const what = n === 0 ? '' : n === 1 ? ' with 1 change' : ` with ${n} changes`;
  return updated?.fromVersion ? `Updated from ${updated.fromVersion}${what}.` : `Updated${what}.`;
}

/** The running version, for the line at the top of the board. Owner only: nobody else is told. */
export function useAppVersion() {
  const [version, setVersion] = React.useState('');
  React.useEffect(() => {
    if (DEMO) return undefined;
    let stopped = false;
    let timer = null;
    const ask = () => appUpdateApi.status()
      .then((data) => { if (!stopped) setVersion(data?.version || ''); })
      .catch((err) => { if ([401, 403, 404].includes(err?.status)) stopped = true; })
      .finally(() => { if (!stopped) timer = setTimeout(ask, ASK_EVERY_MS); });
    ask();
    return () => { stopped = true; clearTimeout(timer); };
  }, []);
  return version;
}
