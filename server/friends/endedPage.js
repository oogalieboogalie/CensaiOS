// What a friend's browser shows when the board they were on is no longer
// shared with them: one plain page that says so and what to do next.

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

export const ENDED = 'This board is no longer being shared with you. Ask your friend to share it again.';
export const WRONG_ADDRESS = 'Open this board from your own censaiOS: Settings, Sharing, Friends, and paste the party code there.';

/** @param {string} [hostName] who was sharing */
export function endedPage(hostName) {
  const host = hostName ? escapeHtml(hostName) : 'Your friend';
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>censaiOS</title>
<style>
:root{color-scheme:dark light;--bg:#0E0E0E;--ink:#EAEAEA;--soft:#9A9A96}
@media (prefers-color-scheme: light){:root{--bg:#F5F5F2;--ink:#1A1A18;--soft:#5F5F5A}}
html,body{margin:0;height:100%;background:var(--bg);color:var(--ink);font:15px/1.5 Inter,system-ui,sans-serif}
main{min-height:100%;display:grid;place-items:center;padding:24px;box-sizing:border-box}
.card{max-width:440px;text-align:center}
h1{font-size:22px;margin:0 0 8px;font-weight:600}p{color:var(--soft);margin:0 0 12px}b{color:var(--ink)}
</style></head><body><main><div class="card">
<h1>${host} stopped sharing this board</h1>
<p>Nothing is wrong on your computer. To come back, ask ${host} to share the board again and send you the new party code, then paste it in your own censaiOS: <b>Settings</b>, <b>Sharing</b>, <b>Friends</b>.</p>
<p>You can close this tab.</p>
</div></main></body></html>`;
}
