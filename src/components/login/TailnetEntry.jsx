import React from 'react';
import { enterFromTailnet, tailnetHello } from '../../lib/tailnet/index.js';

/**
 * Sign-in on another computer, before the code form: when this device is on
 * the owner's tailnet and switched on in "My Tailscale devices", it is signed
 * in at once with nothing to type. Any other device gets the code form
 * (`children`) as before, with a line saying what to switch on when censaiOS
 * recognises the device.
 */
const ENTERED_KEY = 'homebase.tailnet.entered.v1';

// Set once this tab has been let in. If the sign-in screen shows again in
// the same tab, the person signed out on purpose: offer a button, don't
// sign them straight back in.
function enteredBefore() {
  try { return globalThis.sessionStorage?.getItem(ENTERED_KEY) === '1'; } catch { return false; }
}
function rememberEntered() {
  try { globalThis.sessionStorage?.setItem(ENTERED_KEY, '1'); } catch { /* private mode */ }
}

export function TailnetEntry({ onLoginSuccess, children }) {
  const [state, setState] = React.useState({ step: 'checking', device: '' });

  const enter = React.useCallback(async (device) => {
    setState({ step: 'entering', device });
    try {
      await enterFromTailnet();
      rememberEntered();
      onLoginSuccess();
    } catch {
      setState({ step: 'code', device: '' });
    }
  }, [onLoginSuccess]);

  React.useEffect(() => {
    let live = true;
    (async () => {
      const hello = await tailnetHello().catch(() => null);
      if (!live) return;
      if (hello?.app !== 'censaiOS' || !hello.device) return setState({ step: 'code', device: '' });
      if (!hello.admitted) return setState({ step: 'code', device: hello.device });
      if (enteredBefore()) return setState({ step: 'ask', device: hello.device });
      return enter(hello.device);
    })();
    return () => { live = false; };
    // Runs once: the answer does not change while this screen is open.
  }, []);

  if (state.step === 'checking') {
    return <p className="hb-login-note" role="status" data-testid="tailnet-entry">Checking this device…</p>;
  }
  if (state.step === 'entering') {
    return <p className="hb-login-note" role="status" data-testid="tailnet-entry">Opening your board on {state.device}…</p>;
  }
  if (state.step === 'ask') {
    return (
      <div className="hb-login-form" data-testid="tailnet-entry">
        <p className="hb-login-note">You are signed out. This device, <strong>{state.device}</strong>, is switched on, so it needs no code.</p>
        <button type="button" className="hb-login-primary" onClick={() => enter(state.device)}>Open my board</button>
      </div>
    );
  }
  return (
    <>
      {state.device ? (
        <p className="hb-login-note" data-testid="tailnet-entry-hint">
          This device, <strong>{state.device}</strong>, is on your Tailscale but not switched on yet. To skip the code next time:
          on your main computer open Settings, Open anywhere, My Tailscale devices, and switch it on.
        </p>
      ) : null}
      {children}
    </>
  );
}
