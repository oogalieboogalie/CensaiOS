// One CAD worker for every CAD window on the board (the kernel is large, so
// it loads once). Jobs run one at a time; a job that runs too long ends the
// worker, and the next job starts a fresh one.
const BUILD_LIMIT_MS = 45000;

let worker = null;
let seq = 0;
let queue = Promise.resolve();

function start() {
  worker = new Worker(new URL('./cad.worker.js', import.meta.url), { type: 'module' });
  return worker;
}

function stop() {
  try { worker?.terminate(); } catch { /* already gone */ }
  worker = null;
}

function send(message, transfer) {
  return new Promise((resolve, reject) => {
    let w;
    try { w = worker || start(); } catch (err) { reject(new Error(`The CAD kernel could not start: ${err.message}`)); return; }
    const id = (seq += 1);
    const done = () => { clearTimeout(timer); w.removeEventListener('message', onMessage); w.removeEventListener('error', onError); };
    const timer = setTimeout(() => {
      done();
      stop();
      reject(new Error('The part took too long to build, so it was stopped. Is a loop running forever, or are there thousands of holes?'));
    }, BUILD_LIMIT_MS);
    const onMessage = (e) => { if (e.data?.id !== id) return; done(); resolve(e.data); };
    const onError = (e) => { done(); stop(); reject(new Error(e.message || 'The CAD kernel stopped.')); };
    w.addEventListener('message', onMessage);
    w.addEventListener('error', onError);
    w.postMessage({ ...message, id }, transfer || []);
  });
}

/** Queue a job: { type: 'build' | 'export' | 'warm', code, overrides, format }. */
export function cadJob(message) {
  const run = queue.then(() => send(message));
  queue = run.catch(() => undefined);
  return run;
}

export const cadAvailable = () => typeof Worker !== 'undefined';
