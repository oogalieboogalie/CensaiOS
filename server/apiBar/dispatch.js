// server/apiBar/dispatch.js
//
// The doorman's walk to the back room: replay one request through the
// censaiOS app itself, so the route behind a branch runs with every guard it
// normally has (sign-in check, local-files-only, per-person keys), then hand
// its JSON answer back to the bar instead of straight to the caller.
//
// A caller with a bar key has no sign-in of their own, so for the length of
// one replay the request carries the key owner's sign-in (asUser). It is put
// back before the bar answers, so it is never saved to a cookie.

const SESSION_FIELDS = ['userId', 'userEmail', 'userRole', 'userName'];

function parseText(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { text: String(text).slice(0, 20000) };
  }
}

function queryString(query = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    params.set(key, String(value));
  }
  const text = params.toString();
  return text ? `?${text}` : '';
}

/**
 * Run one route inside the app and capture its answer.
 * Returns { status, data }. Never throws.
 */
export function dispatchInternal(req, res, { method, path, query, body, asUser = null }) {
  const app = req.app;
  const url = `${path}${queryString(query)}`;
  const saved = {
    url: req.url, originalUrl: req.originalUrl, method: req.method, body: req.body,
    accept: req.headers.accept, statusCode: res.statusCode,
    json: res.json, send: res.send, status: res.status, sendStatus: res.sendStatus, write: res.write, end: res.end,
  };
  const session = req.session || null;
  const savedSession = session ? SESSION_FIELDS.map((f) => [f, Object.hasOwn(session, f), session[f]]) : [];

  return new Promise((resolve) => {
    let status = null;
    let done = false;
    const chunks = [];

    const restore = () => {
      req.url = saved.url;
      req.originalUrl = saved.originalUrl;
      req.method = saved.method;
      req.body = saved.body;
      if (saved.accept === undefined) delete req.headers.accept; else req.headers.accept = saved.accept;
      for (const f of ['json', 'send', 'status', 'sendStatus', 'write', 'end']) delete res[f];
      for (const f of ['json', 'send', 'status', 'sendStatus', 'write', 'end']) {
        if (res[f] !== saved[f]) res[f] = saved[f];
      }
      const innerCode = res.statusCode;
      res.statusCode = saved.statusCode;
      if (session) {
        for (const [f, had, value] of savedSession) {
          if (had) session[f] = value; else delete session[f];
        }
      }
      return innerCode;
    };
    const finish = (data) => {
      if (done) return;
      done = true;
      const innerCode = restore();
      const code = status ?? (innerCode !== saved.statusCode ? innerCode : 200);
      resolve({ status: code, data });
    };

    res.status = (code) => { status = Number(code); return res; };
    res.sendStatus = (code) => { status = Number(code); finish(null); return res; };
    res.json = (data) => { finish(data); return res; };
    res.send = (data) => {
      finish(typeof data === 'string' || Buffer.isBuffer(data) ? parseText(String(data)) : data);
      return res;
    };
    res.write = (chunk) => { if (chunk) chunks.push(String(chunk)); return true; };
    res.end = (chunk) => {
      if (chunk && typeof chunk !== 'function') chunks.push(String(chunk));
      finish(parseText(chunks.join('')));
      return res;
    };

    req.url = url;
    req.originalUrl = url;
    req.method = method;
    req.body = body && typeof body === 'object' ? body : {};
    req.headers.accept = 'application/json';
    if (asUser && session) {
      for (const f of SESSION_FIELDS) {
        if (asUser[f] === undefined || asUser[f] === null) delete session[f]; else session[f] = asUser[f];
      }
    }

    try {
      app.handle(req, res, (err) => {
        if (err) {
          status = Number(err.status || err.statusCode) || 500;
          finish({ error: status >= 500 ? 'The API behind this branch failed.' : err.message });
        } else {
          status = 404;
          finish({ error: 'Nothing answers at that address.' });
        }
      });
    } catch {
      status = 500;
      finish({ error: 'The API behind this branch failed.' });
    }
  });
}

export const __test__ = { queryString, parseText };
