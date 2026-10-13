import React from 'react';
import { redeemPairCode } from '../../lib/webOs.js';

function codeFrom(text) {
  const value = String(text || '').trim();
  try {
    return new URL(value).searchParams.get('pair') || value;
  } catch {
    return value;
  }
}

// Sign-in on another computer that opened censaiOS by its home-network
// address (Open anywhere). Email sign-in is not offered here: anyone on the
// same Wi-Fi could type an email. The code comes from the main computer.
export function PairSignIn({ onLoginSuccess }) {
  const [text, setText] = React.useState('');
  const [error, setError] = React.useState('');
  const [loading, setLoading] = React.useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      await redeemPairCode(codeFrom(text));
      onLoginSuccess();
    } catch (err) {
      setError(err.message || 'That code did not work.');
      setLoading(false);
    }
  };

  return (
    <form className="hb-login-form" onSubmit={submit} data-testid="pair-sign-in">
      <p className="hb-login-note">
        You opened censaiOS from another computer. On your main computer, open Settings, then
        Open anywhere, then Add a computer. Scan the code with this device, or paste the link here.
      </p>
      {error && <div className="hb-login-error" role="alert">{error}</div>}
      <label className="hb-login-field">
        <span>Link or code</span>
        <input type="text" value={text} onChange={(e) => setText(e.target.value)} placeholder="http://…/?pair=…" required autoFocus />
      </label>
      <button type="submit" className="hb-login-primary" disabled={loading || !text.trim()}>
        {loading ? 'Signing in…' : 'Sign in this computer'}
      </button>
    </form>
  );
}
