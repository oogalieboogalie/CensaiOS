import React from 'react';
import { BrandMark, BrandWordmark } from '../components/brand/BrandMark.jsx';
import { redeemPairCode } from '../lib/webOs.js';

// Opened from an "Add a computer" link (Settings, Open anywhere): signs this
// computer in as the person who made the code, then opens their board.
export function PairApp({ code }) {
  const [state, setState] = React.useState({ status: 'working', message: '' });

  React.useEffect(() => {
    let cancelled = false;
    redeemPairCode(code)
      .then(() => {
        if (!cancelled) window.location.replace('/');
      })
      .catch((error) => {
        if (!cancelled) setState({ status: 'error', message: error.message });
      });
    return () => { cancelled = true; };
  }, [code]);

  return (
    <div className="hb-login" data-testid="pair-screen">
      <main className="hb-login-column">
        <div className="hb-login-brand">
          <BrandMark size={56} />
          <BrandWordmark size="var(--text-2xl)" />
        </div>
        <div className="hb-login-card">
          {state.status === 'working' ? (
            <p className="hb-login-note" role="status">Signing this computer in…</p>
          ) : (
            <>
              <div className="hb-login-error" role="alert">{state.message}</div>
              <button type="button" className="hb-login-primary" onClick={() => window.location.replace('/')}>
                Go to sign-in
              </button>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
