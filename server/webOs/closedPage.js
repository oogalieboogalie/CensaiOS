import { doorUsable, isFromAnotherComputer, readDoorSettings } from './door.js';

// What another computer sees when it opens this censaiOS by its home-network
// address while Open anywhere is off. Without this page the browser refuses
// the app's own files and shows a blank screen.
export const CLOSED_PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>censaiOS</title><link rel="icon" type="image/svg+xml" href="/assets/favicon.svg">
<style>
:root{color-scheme:dark light;--bg:#0E0E0E;--ink:#EAEAEA;--soft:#9A9A96;--accent:#E5A83A}
@media (prefers-color-scheme: light){:root{--bg:#F5F5F2;--ink:#1A1A18;--soft:#5F5F5A}}
html,body{margin:0;height:100%;background:var(--bg);color:var(--ink);font:15px/1.5 Inter,system-ui,sans-serif}
main{min-height:100%;display:grid;place-items:center;padding:24px;box-sizing:border-box}
.card{max-width:440px;text-align:center}img{width:56px;height:56px}
h1{font-size:22px;margin:18px 0 8px;font-weight:600}p{color:var(--soft);margin:0 0 12px}
b{color:var(--ink)}button{margin-top:6px;border:0;border-radius:10px;padding:10px 18px;background:var(--accent);color:#0E0E0E;font:inherit;font-weight:600;cursor:pointer}
</style></head><body><main><div class="card">
<img src="/assets/favicon.svg" alt="">
<h1>This censaiOS is not open to other computers yet</h1>
<p>On the computer that runs censaiOS, open <b>Settings</b>, then <b>Open anywhere</b>, and turn on <b>Let my other computers open censaiOS</b>.</p>
<button type="button" onclick="location.reload()">Try again</button>
</div></main></body></html>`;

export function doorClosedPage(req, res, next) {
  if (req.method !== 'GET' || req.path.startsWith('/api/') || req.path.startsWith('/assets/')) return next();
  if (!doorUsable() || readDoorSettings().open || !isFromAnotherComputer(req)) return next();
  res.status(403).type('html').send(CLOSED_PAGE);
}
