import React from 'react';
import { api } from '../lib/api.js';

const STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;400;600&display=swap');
  
  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(20px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .animate-fade-in {
    animation: fadeIn 1s ease-out forwards;
  }
  .animate-fade-in-delayed {
    opacity: 0;
    animation: fadeIn 1s ease-out 0.3s forwards;
  }
  .dot-grid {
    background-image: radial-gradient(circle, rgba(255, 255, 255, 0.08) 1px, transparent 1px);
    background-size: 24px 24px;
    background-color: #00041f;
  }
`;

export function Login({ onLoginSuccess, oauthConfigured }) {
  const [email, setEmail] = React.useState('');
  const [name, setName] = React.useState('');
  const [error, setError] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [showDevForm, setShowDevForm] = React.useState(!oauthConfigured);
  const [showPrivacy, setShowPrivacy] = React.useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email) {
      setError('Email is required');
      return;
    }
    setError('');
    setLoading(true);

    try {
      await api.developerLogin({ email, name });
      onLoginSuccess();
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="dot-grid" style={{
      position: 'fixed',
      inset: 0,
      display: 'flex',
      flexDirection: 'column',
      fontFamily: "'Sora', sans-serif",
      color: '#e5e7eb',
      overflowX: 'hidden',
      zIndex: 9999
    }}>
      <style dangerouslySetInnerHTML={{ __html: STYLES }} />

      {/* BEGIN: Hero Logo Area */}
      <div style={{
        position: 'relative',
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '40vh',
        width: '100%',
        paddingTop: '3rem',
      }} className="animate-fade-in">
        {/* Radial Glow */}
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '70vh',
          height: '70vh',
          backgroundColor: 'rgba(8, 16, 216, 0.05)',
          borderRadius: '50%',
          filter: 'blur(120px)',
          pointerEvents: 'none',
          zIndex: 0
        }} />
        {/* Massive Logo */}
        <img
          alt="Platform Logo"
          src="/assets/logolite.png"
          style={{
            position: 'relative',
            zIndex: 10,
            height: '40vh',
            maxHeight: '400px',
            objectFit: 'contain',
            filter: 'drop-shadow(0 10px 30px rgba(8, 16, 216, 0.15))'
          }}
        />
      </div>
      {/* END: Hero Logo Area */}

      {/* BEGIN: HUD / Bottom Overlay */}
      <div style={{
        width: '100%',
        maxWidth: '48rem',
        marginLeft: 'auto',
        marginRight: 'auto',
        paddingLeft: '1.5rem',
        paddingRight: '1.5rem',
        paddingBottom: '3rem',
        zIndex: 20,
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center'
      }} className="animate-fade-in-delayed">
        {/* Sign in or Sign Up Divider */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          width: '100%',
          maxWidth: '360px',
          gap: '1rem',
          marginBottom: '2rem',
          fontSize: '0.75rem',
          textTransform: 'uppercase',
          letterSpacing: '0.15em',
          color: '#9ca3af',
          fontWeight: 600
        }}>
          <span style={{ flex: 1, height: '1px', backgroundColor: 'rgba(8, 16, 216, 0.15)' }} />
          <span>Sign in or Sign Up</span>
          <span style={{ flex: 1, height: '1px', backgroundColor: 'rgba(8, 16, 216, 0.15)' }} />
        </div>

        {/* BEGIN: Social Authentication Row */}
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          gap: '1.5rem',
          marginBottom: showDevForm ? '1.5rem' : '2.5rem',
          width: '100%'
        }}>
          {/* Google */}
          {oauthConfigured ? (
            <a
              href="/api/auth/google"
              title="Sign in with Google"
              style={{
                width: '4rem',
                height: '4rem',
                borderRadius: '50%',
                border: '1px solid rgba(8, 16, 216, 0.2)',
                backgroundColor: 'rgba(255, 255, 255, 0.4)',
                backdropFilter: 'blur(12px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s',
                cursor: 'pointer',
                boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                textDecoration: 'none'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.6)';
                e.currentTarget.style.borderColor = 'rgb(255, 255, 255)';
                e.currentTarget.style.boxShadow = '0 0 15px rgba(8, 16, 216, 0.1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.4)';
                e.currentTarget.style.borderColor = 'rgba(8, 16, 216, 0.2)';
                e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.05)';
              }}
            >
              <svg style={{ width: '1.75rem', height: '1.75rem' }} viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
            </a>
          ) : (
            <button
              type="button"
              title="Sign in with Google"
              onClick={() => alert('Google OAuth is not configured. Please use Developer Bypass.')}
              style={{
                width: '4rem',
                height: '4rem',
                borderRadius: '50%',
                border: '1px solid rgba(8, 16, 216, 0.2)',
                backgroundColor: 'rgba(255, 255, 255, 0.4)',
                backdropFilter: 'blur(12px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s',
                cursor: 'pointer',
                boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.6)';
                e.currentTarget.style.borderColor = 'rgb(255, 255, 255)';
                e.currentTarget.style.boxShadow = '0 0 15px rgba(8, 16, 216, 0.1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.4)';
                e.currentTarget.style.borderColor = 'rgba(8, 16, 216, 0.2)';
                e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.05)';
              }}
            >
              <svg style={{ width: '1.75rem', height: '1.75rem' }} viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
            </button>
          )}

          {/* GitHub */}
          <button
            type="button"
            title="Sign in with GitHub"
            onClick={() => alert('GitHub OAuth is not configured. Please use Google or Developer Bypass.')}
            style={{
              width: '4rem',
              height: '4rem',
              borderRadius: '50%',
              border: '1px solid rgba(8, 16, 216, 0.2)',
              backgroundColor: 'rgba(255, 255, 255, 0.4)',
              backdropFilter: 'blur(12px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#24292f',
              transition: 'all 0.2s',
              cursor: 'pointer',
              boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.6)';
              e.currentTarget.style.borderColor = 'rgb(255, 255, 255)';
              e.currentTarget.style.color = '#000000';
              e.currentTarget.style.boxShadow = '0 0 15px rgba(8, 16, 216, 0.1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.4)';
              e.currentTarget.style.borderColor = 'rgba(8, 16, 216, 0.2)';
              e.currentTarget.style.color = '#24292f';
              e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.05)';
            }}
          >
            <svg style={{ width: '1.75rem', height: '1.75rem' }} fill="currentColor" viewBox="0 0 24 24">
              <path clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" fillRule="evenodd" />
            </svg>
          </button>

          {/* Email */}
          <button
            type="button"
            title="Developer Login Bypass"
            onClick={() => setShowDevForm(prev => !prev)}
            style={{
              width: '4rem',
              height: '4rem',
              borderRadius: '50%',
              border: showDevForm ? '1px solid rgba(8, 16, 216, 0.5)' : '1px solid rgba(8, 16, 216, 0.2)',
              backgroundColor: showDevForm ? 'rgba(255, 255, 255, 0.7)' : 'rgba(255, 255, 255, 0.4)',
              backdropFilter: 'blur(12px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: showDevForm ? '#0810d8' : '#cbd5e1',
              transition: 'all 0.2s',
              cursor: 'pointer',
              boxShadow: showDevForm ? '0 0 15px rgba(8, 16, 216, 0.15)' : '0 1px 2px rgba(0,0,0,0.05)'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.6)';
              e.currentTarget.style.borderColor = 'rgba(8, 16, 216, 0.4)';
              e.currentTarget.style.boxShadow = '0 0 15px rgba(8, 16, 216, 0.1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = showDevForm ? 'rgba(255, 255, 255, 0.7)' : 'rgba(255, 255, 255, 0.4)';
              e.currentTarget.style.borderColor = showDevForm ? 'rgba(8, 16, 216, 0.5)' : 'rgba(8, 16, 216, 0.2)';
              e.currentTarget.style.boxShadow = showDevForm ? '0 0 15px rgba(8, 16, 216, 0.15)' : '0 1px 2px rgba(0,0,0,0.05)';
            }}
          >
            <svg style={{ width: '1.75rem', height: '1.75rem' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
            </svg>
          </button>

          {/* Platform/Passkey */}
          <button
            type="button"
            title="Passkey Sign-in"
            onClick={() => alert('Passkey authentication is not configured in this environment.')}
            style={{
              width: '4rem',
              height: '4rem',
              borderRadius: '50%',
              border: '1px solid rgba(8, 16, 216, 0.2)',
              backgroundColor: 'rgba(255, 255, 255, 0.4)',
              backdropFilter: 'blur(12px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#cbd5e1',
              transition: 'all 0.2s',
              cursor: 'pointer',
              boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.6)';
              e.currentTarget.style.borderColor = 'rgba(8, 16, 216, 0.4)';
              e.currentTarget.style.boxShadow = '0 0 15px rgba(8, 16, 216, 0.1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.4)';
              e.currentTarget.style.borderColor = 'rgba(8, 16, 216, 0.2)';
              e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.05)';
            }}
          >
            <svg style={{ width: '1.75rem', height: '1.75rem' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
            </svg>
          </button>
        </div>
        {/* END: Social Authentication Row */}

        <div style={{
          width: '100%',
          maxWidth: '360px',
          maxHeight: showDevForm ? '500px' : '0px',
          opacity: showDevForm ? 1 : 0,
          overflow: 'hidden',
          transition: 'max-height 0.6s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.6s cubic-bezier(0.16, 1, 0.3, 1), margin-bottom 0.6s cubic-bezier(0.16, 1, 0.3, 1)',
          marginBottom: showDevForm ? '2rem' : '0px',
          display: 'flex',
          flexDirection: 'column'
        }}>
          <form onSubmit={handleSubmit} style={{
            width: '100%',
            padding: '30px 24px',
            background: 'rgba(255, 255, 255, 0.4)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(8, 16, 216, 0.15)',
            borderRadius: '16px',
            boxShadow: '0 8px 32px rgba(8, 16, 216, 0.05)',
            display: 'grid',
            gap: '20px',
            textAlign: 'left',
            boxSizing: 'border-box'
          }}>
            {error && (
              <div style={{
                padding: '10px 12px',
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.2)',
                borderRadius: '8px',
                fontSize: '12px',
                color: '#dc2626',
                textAlign: 'left'
              }}>
                {error}
              </div>
            )}

            <div style={{ display: 'grid', gap: '6px' }}>
              <label style={{
                fontSize: '11px',
                fontWeight: 600,
                color: '#cbd5e1',
                textTransform: 'uppercase',
                letterSpacing: '0.05em'
              }}>
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="alex@censai.dev"
                required
                style={{
                  padding: '10px 12px',
                  background: 'rgba(255, 255, 255, 0.6)',
                  border: '1px solid rgba(8, 16, 216, 0.15)',
                  borderRadius: '8px',
                  fontSize: '13px',
                  color: '#e5e7eb',
                  outline: 'none',
                  transition: 'all 0.2s'
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = '#0810d8';
                  e.target.style.boxShadow = '0 0 0 2px rgba(8, 16, 216, 0.1)';
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = 'rgba(8, 16, 216, 0.15)';
                  e.target.style.boxShadow = 'none';
                }}
              />
            </div>

            <div style={{ display: 'grid', gap: '6px' }}>
              <label style={{
                fontSize: '11px',
                fontWeight: 600,
                color: '#cbd5e1',
                textTransform: 'uppercase',
                letterSpacing: '0.05em'
              }}>
                Name (Optional)
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Alex"
                style={{
                  padding: '10px 12px',
                  background: 'rgba(255, 255, 255, 0.6)',
                  border: '1px solid rgba(8, 16, 216, 0.15)',
                  borderRadius: '8px',
                  fontSize: '13px',
                  color: '#e5e7eb',
                  outline: 'none',
                  transition: 'all 0.2s'
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = '#0810d8';
                  e.target.style.boxShadow = '0 0 0 2px rgba(8, 16, 216, 0.1)';
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = 'rgba(8, 16, 216, 0.15)';
                  e.target.style.boxShadow = 'none';
                }}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              data-convex-lens="true"
              style={{
                position: 'relative',
                marginTop: '8px',
                padding: '12px 16px',
                // Convex lens: light highlight at upper-center, dark rim at edge.
                // Ellipse skewed slightly upward so the highlight reads as a dome top.
                background: 'radial-gradient(ellipse 75% 100% at 50% 25%, #6a73ff 0%, #2a32e6 38%, #0810d8 70%, #050796 100%)',
                color: '#ffffff',
                border: '1px solid rgba(8, 16, 216, 0.6)',
                borderRadius: '9999px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: loading ? 'not-allowed' : 'pointer',
                textAlign: 'center',
                letterSpacing: '0.02em',
                textShadow: '0 1px 0 rgba(0, 0, 0, 0.2)',
                // Top inset highlight + bottom inset shadow give the bevel; outer shadow lifts.
                boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.45), inset 0 -1px 0 rgba(0, 0, 0, 0.18), 0 4px 12px rgba(8, 16, 216, 0.35)',
                transition: 'transform 0.2s ease, box-shadow 0.25s ease, background 0.25s ease'
              }}
              onMouseEnter={(e) => {
                if (!loading) {
                  e.currentTarget.style.transform = 'translateY(-1px)';
                  // Hover: glow kicks in. Two layered drop-shadows mimic the logo's radial halo.
                  e.currentTarget.style.boxShadow = 'inset 0 1px 0 rgba(255, 255, 255, 0.55), inset 0 -1px 0 rgba(0, 0, 0, 0.22), 0 0 0 1px rgba(106, 115, 255, 0.5), 0 0 26px 2px rgba(106, 115, 255, 0.35), 0 6px 18px rgba(8, 16, 216, 0.4)';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'none';
                e.currentTarget.style.boxShadow = 'inset 0 1px 0 rgba(255, 255, 255, 0.45), inset 0 -1px 0 rgba(0, 0, 0, 0.18), 0 4px 12px rgba(8, 16, 216, 0.35)';
              }}
            >
              {loading ? 'Entering...' : 'Enter Canvas'}
            </button>
            <span style={{ fontSize: '10px', color: '#9ca3af', textAlign: 'center', marginTop: '4px' }}>
              * Developer Bypass Mode
            </span>
          </form>
        </div>
        {/* END: Credentials Form */}

        {/* BEGIN: Footer Links */}
        <footer style={{
          marginTop: '3rem',
          color: '#9ca3af',
          fontSize: '0.75rem',
          display: 'flex',
          gap: '2rem',
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
          fontWeight: 500
        }}>
          <a href="#"
             onClick={(e) => { e.preventDefault(); setShowPrivacy(true); }}
             style={{ color: 'inherit', textDecoration: 'none', transition: 'color 0.2s', cursor: 'pointer' }}
             onMouseEnter={(e) => e.currentTarget.style.color = '#e5e7eb'}
             onMouseLeave={(e) => e.currentTarget.style.color = 'inherit'}>Privacy</a>
          <a href="#" style={{ color: 'inherit', textDecoration: 'none', transition: 'color 0.2s' }}
             onMouseEnter={(e) => e.currentTarget.style.color = '#e5e7eb'}
             onMouseLeave={(e) => e.currentTarget.style.color = 'inherit'}>Terms</a>
          <a href="#" style={{ color: 'inherit', textDecoration: 'none', transition: 'color 0.2s' }}
             onMouseEnter={(e) => e.currentTarget.style.color = '#e5e7eb'}
             onMouseLeave={(e) => e.currentTarget.style.color = 'inherit'}>Help</a>
        </footer>
        {/* END: Footer Links */}
      </div>
      {/* END: HUD / Bottom Overlay */}

      {/* BEGIN: Privacy Modal Overlay */}
      {showPrivacy && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.6)',
          backdropFilter: 'blur(12px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000,
          padding: '2rem',
          animation: 'fadeIn 0.3s ease-out forwards'
        }}>
          <div style={{
            backgroundColor: 'rgba(255, 255, 255, 0.85)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(8, 16, 216, 0.15)',
            borderRadius: '24px',
            width: '100%',
            maxWidth: '680px',
            maxHeight: '85vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 20px 50px rgba(0, 0, 0, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.5)',
            overflow: 'hidden',
            color: '#e2e8f0'
          }}>
            {/* Modal Header */}
            <div style={{
              padding: '1.75rem 2rem',
              borderBottom: '1px solid rgba(8, 16, 216, 0.1)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: 'linear-gradient(to right, rgba(8, 16, 216, 0.03), transparent)'
            }}>
              <div style={{ textAlign: 'left' }}>
                <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600, color: '#e5e7eb', letterSpacing: '-0.02em' }}>Privacy Policy & Data Flow</h3>
                <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.75rem', color: '#94a3b8' }}>Supporting self-hosted and secure cloud environments.</p>
              </div>
              <button 
                onClick={() => setShowPrivacy(false)}
                style={{
                  background: 'rgba(8, 16, 216, 0.05)',
                  border: 'none',
                  borderRadius: '50%',
                  width: '2rem',
                  height: '2rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  color: '#cbd5e1',
                  transition: 'all 0.2s',
                  fontSize: '0.85rem'
                }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(8, 16, 216, 0.1)'; e.currentTarget.style.color = '#e5e7eb'; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'rgba(8, 16, 216, 0.05)'; e.currentTarget.style.color = '#cbd5e1'; }}
              >
                Close
              </button>
            </div>

            {/* Modal Body */}
            <div style={{
              padding: '2rem',
              overflowY: 'auto',
              fontSize: '0.875rem',
              lineHeight: 1.6,
              display: 'flex',
              flexDirection: 'column',
              gap: '1.5rem',
              textAlign: 'left'
            }}>
              {/* Highlight Card */}
              <div style={{
                background: 'linear-gradient(135deg, rgba(8, 16, 216, 0.05) 0%, rgba(8, 16, 216, 0.01) 100%)',
                border: '1px solid rgba(8, 16, 216, 0.1)',
                borderRadius: '16px',
                padding: '1.25rem',
                display: 'flex',
                gap: '1rem',
                alignItems: 'flex-start'
              }}>
                <div>
                  <h4 style={{ margin: '0 0 0.25rem 0', fontWeight: 600, color: '#e5e7eb' }}>Local or Cloud Workspace Storage</h4>
                  <p style={{ margin: 0, color: '#cbd5e1', fontSize: '0.8rem' }}>
                    Depending on your installation type (self-hosted local vs. cloud deployment), all canvas boards, layout states, and configurations are stored either in your local browser storage (under the key <code style={{ background: 'rgba(8, 16, 216, 0.06)', padding: '2px 4px', borderRadius: '4px' }}>homebase.workspace.v1</code>) or synchronized with your cloud database account. We do not track telemetry, usage analytics, or keystrokes.
                  </p>
                </div>
              </div>

              {/* Journal Security Section */}
              <div>
                <h4 style={{ margin: '0 0 0.5rem 0', fontWeight: 600, color: '#e5e7eb' }}>
                  Journal Security & Encryption
                </h4>
                <p style={{ margin: 0, color: '#cbd5e1' }}>
                  Agent journals are encrypted at rest using industry-standard AES-256-GCM. Encryption keys are securely managed via environment-defined variables in self-hosted instances, or isolated cloud key vaults in cloud deployments, keeping your private workspace journals confidential.
                </p>
              </div>

              {/* Authentication Providers */}
              <div>
                <h4 style={{ margin: '0 0 0.5rem 0', fontWeight: 600, color: '#e5e7eb' }}>
                  Authentication Providers
                </h4>
                <p style={{ margin: '0 0 0.75rem 0', color: '#cbd5e1' }}>
                  When using OAuth for secure login, your authentication requests are processed directly by the respective providers. You can review their privacy policies below:
                </p>
                <div style={{ display: 'grid', gap: '0.75rem', gridTemplateColumns: '1fr 1fr' }}>
                  <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" style={{
                    border: '1px solid rgba(0, 0, 0, 0.06)',
                    borderRadius: '12px',
                    padding: '1rem',
                    backgroundColor: 'rgba(255, 255, 255, 0.5)',
                    textDecoration: 'none',
                    color: '#e5e7eb',
                    fontWeight: 600,
                    fontSize: '0.85rem',
                    transition: 'all 0.2s',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.25rem'
                  }} onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(8, 16, 216, 0.2)'; e.currentTarget.style.backgroundColor = '#ffffff'; }}
                     onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(0, 0, 0, 0.06)'; e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.5)'; }}>
                    <span>Google Privacy Policy</span>
                    <span style={{ fontSize: '0.75rem', fontWeight: 400, color: '#94a3b8' }}>View Google's terms and data policies ↗</span>
                  </a>

                  <a href="https://docs.github.com/en/site-policy/privacy-policies/github-privacy-statement" target="_blank" rel="noopener noreferrer" style={{
                    border: '1px solid rgba(0, 0, 0, 0.06)',
                    borderRadius: '12px',
                    padding: '1rem',
                    backgroundColor: 'rgba(255, 255, 255, 0.5)',
                    textDecoration: 'none',
                    color: '#e5e7eb',
                    fontWeight: 600,
                    fontSize: '0.85rem',
                    transition: 'all 0.2s',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.25rem'
                  }} onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(8, 16, 216, 0.2)'; e.currentTarget.style.backgroundColor = '#ffffff'; }}
                     onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(0, 0, 0, 0.06)'; e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.5)'; }}>
                    <span>GitHub Privacy Statement</span>
                    <span style={{ fontSize: '0.75rem', fontWeight: 400, color: '#94a3b8' }}>View GitHub's terms and data policies ↗</span>
                  </a>
                </div>
              </div>

              {/* AI Provider Details */}
              <div>
                <h4 style={{ margin: '0 0 0.5rem 0', fontWeight: 600, color: '#e5e7eb' }}>
                  Artificial Intelligence Providers
                </h4>
                <p style={{ margin: '0 0 0.75rem 0', color: '#cbd5e1' }}>
                  Censai Hub routes agent prompts to various language models depending on your settings. The data flows for each supported provider are detailed below:
                </p>
                
                <div style={{ display: 'grid', gap: '0.75rem' }}>
                  {/* Ollama */}
                  <div style={{ border: '1px solid rgba(0, 0, 0, 0.06)', borderRadius: '12px', padding: '1rem', backgroundColor: 'rgba(255, 255, 255, 0.5)' }}>
                    <div style={{ fontWeight: 600, color: '#e5e7eb', display: 'flex', justifyContent: 'space-between' }}>
                      <span>Ollama (Local Execution)</span>
                      <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', padding: '2px 6px', backgroundColor: '#dcfce7', color: '#166534', borderRadius: '100px', fontWeight: 700 }}>Fully Private</span>
                    </div>
                    <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.8rem', color: '#94a3b8' }}>
                      Runs entirely on your local hardware. No prompt data, code snippets, or agent personalities are ever sent to external cloud servers.
                    </p>
                  </div>

                  {/* Google */}
                  <div style={{ border: '1px solid rgba(0, 0, 0, 0.06)', borderRadius: '12px', padding: '1rem', backgroundColor: 'rgba(255, 255, 255, 0.5)' }}>
                    <div style={{ fontWeight: 600, color: '#e5e7eb', display: 'flex', justifyContent: 'space-between' }}>
                      <span>Google Gemini / Google Native API</span>
                      <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', padding: '2px 6px', backgroundColor: '#e0f2fe', color: '#0369a1', borderRadius: '100px', fontWeight: 700 }}>Cloud API</span>
                    </div>
                    <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.8rem', color: '#94a3b8' }}>
                      Prompts, code contexts, and tool payloads are sent to Google Gemini endpoints. Processed in accordance with Google Cloud APIs terms of service (inputs are generally not used to train models).
                    </p>
                  </div>

                  {/* OpenRouter */}
                  <div style={{ border: '1px solid rgba(0, 0, 0, 0.06)', borderRadius: '12px', padding: '1rem', backgroundColor: 'rgba(255, 255, 255, 0.5)' }}>
                    <div style={{ fontWeight: 600, color: '#e5e7eb', display: 'flex', justifyContent: 'space-between' }}>
                      <span>OpenRouter</span>
                      <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', padding: '2px 6px', backgroundColor: '#e0f2fe', color: '#0369a1', borderRadius: '100px', fontWeight: 700 }}>Cloud Proxy</span>
                    </div>
                    <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.8rem', color: '#94a3b8' }}>
                      Acts as an API proxy routing your requests to various models. Prompts and tool parameters are forwarded to selected models through OpenRouter's developer gateway.
                    </p>
                  </div>

                  {/* Cohere */}
                  <div style={{ border: '1px solid rgba(0, 0, 0, 0.06)', borderRadius: '12px', padding: '1rem', backgroundColor: 'rgba(255, 255, 255, 0.5)' }}>
                    <div style={{ fontWeight: 600, color: '#e5e7eb', display: 'flex', justifyContent: 'space-between' }}>
                      <span>Cohere API</span>
                      <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', padding: '2px 6px', backgroundColor: '#e0f2fe', color: '#0369a1', borderRadius: '100px', fontWeight: 700 }}>Cloud API</span>
                    </div>
                    <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.8rem', color: '#94a3b8' }}>
                      Utilized for high-performance embeddings and specific chat requirements under Cohere's production privacy model policies.
                    </p>
                  </div>

                  {/* Moonshot */}
                  <div style={{ border: '1px solid rgba(0, 0, 0, 0.06)', borderRadius: '12px', padding: '1rem', backgroundColor: 'rgba(255, 255, 255, 0.5)' }}>
                    <div style={{ fontWeight: 600, color: '#e5e7eb', display: 'flex', justifyContent: 'space-between' }}>
                      <span>Moonshot / Kimi API</span>
                      <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', padding: '2px 6px', backgroundColor: '#e0f2fe', color: '#0369a1', borderRadius: '100px', fontWeight: 700 }}>Cloud API</span>
                    </div>
                    <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.8rem', color: '#94a3b8' }}>
                      Generative prompts and context are transmitted to Moonshot endpoints and governed by Moonshot AI policies.
                    </p>
                  </div>
                </div>
              </div>

              {/* Data boundary */}
              <div>
                <h4 style={{ margin: '0 0 0.5rem 0', fontWeight: 600, color: '#e5e7eb' }}>
                  Infrastructure and Storage Boundaries
                </h4>
                <p style={{ margin: 0, color: '#cbd5e1' }}>
                  For local self-hosted instances, your databases (PostgreSQL and Qdrant) run completely on your machine. For cloud versions, data is isolated in secure, single-tenant or multi-tenant database clusters protected by modern firewalls and authentication gates, ensuring complete ownership over your AI ecosystem's long-term memory.
                </p>
              </div>
            </div>

            {/* Modal Footer */}
            <div style={{
              padding: '1.25rem 2rem',
              borderTop: '1px solid rgba(8, 16, 216, 0.1)',
              display: 'flex',
              justifyContent: 'flex-end',
              backgroundColor: 'rgba(255, 255, 255, 0.5)'
            }}>
              <button 
                onClick={() => setShowPrivacy(false)}
                style={{
                  padding: '0.5rem 1.5rem',
                  backgroundColor: '#0810d8',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '100px',
                  fontWeight: 600,
                  fontSize: '0.875rem',
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(8, 16, 216, 0.2)',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-1px)';
                  e.currentTarget.style.boxShadow = '0 6px 16px rgba(8, 16, 216, 0.3)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'none';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(8, 16, 216, 0.2)';
                }}
              >
                Acknowledge
              </button>
            </div>
          </div>
        </div>
      )}
      {/* END: Privacy Modal Overlay */}
    </div>
  );
}
