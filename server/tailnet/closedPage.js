// What a device on the tailnet sees when it opens this censaiOS but the owner
// has not switched it on in "My Tailscale devices".

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

export const NOT_SWITCHED_ON = 'This device is not switched on yet. On the computer that runs censaiOS, open Settings, Open anywhere, My Tailscale devices, and switch this device on.';
export const NOT_RECOGNISED = 'censaiOS does not recognise this device on your Tailscale yet. Check that Tailscale is on here, wait a minute, and try again.';

export const WRONG_ADDRESS = 'Open censaiOS at its own Tailscale address. It is shown on the computer that runs censaiOS, in Settings, Open anywhere, My Tailscale devices.';

/** @param {string} [deviceName] the name Tailscale has for the visiting device */
export function notSwitchedOnPage(deviceName) {
  const name = deviceName ? escapeHtml(deviceName) : '';
  const title = name ? `${name} is not switched on yet` : 'censaiOS does not recognise this device yet';
  const steps = name
    ? `On the computer that runs censaiOS, open <b>Settings</b>, then <b>Open anywhere</b>, then <b>My Tailscale devices</b>, and switch on <b>${name}</b>.`
    : 'Check that Tailscale is on for this device, wait a minute, and try again.';
  return page(title, steps);
}

export function wrongAddressPage() {
  return page(
    'Open censaiOS at its Tailscale address',
    'This is not the address censaiOS gives out. On the computer that runs censaiOS, open <b>Settings</b>, then <b>Open anywhere</b>, then <b>My Tailscale devices</b>, and use the address or the code shown there.',
  );
}

function page(title, steps) {
  return `<!doctype html>
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
<h1>${title}</h1>
<p>${steps}</p>
<p>Only devices switched on there can open this censaiOS.</p>
<button type="button" onclick="location.reload()">Try again</button>
</div></main></body></html>`;
}
