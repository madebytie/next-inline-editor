'use client';

import { useState } from 'react';

export interface AdminLoginProps {
  /** Where to redirect after successful login. Default: '/admin' */
  redirectTo?: string;
  /** API route for login. Default: '/api/admin/login' */
  loginRoute?: string;
}

export default function AdminLogin({ redirectTo = '/admin', loginRoute = '/api/admin/login' }: AdminLoginProps) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch(loginRoute, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || 'Login failed');
        setLoading(false);
        return;
      }
      window.location.href = redirectTo;
    } catch {
      setError('Network error');
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#0a0a0a',
      color: '#fff',
      fontFamily: 'system-ui, sans-serif',
    }}>
      <form onSubmit={onSubmit} style={{
        width: '100%',
        maxWidth: 360,
        padding: 32,
        background: '#161616',
        border: '1px solid #2a2a2a',
        borderRadius: 8,
      }}>
        <h1 style={{ fontSize: 20, margin: '0 0 24px', fontWeight: 500 }}>Admin Login</h1>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          autoFocus
          style={{
            width: '100%',
            padding: '12px 14px',
            background: '#0a0a0a',
            border: '1px solid #333',
            borderRadius: 4,
            color: '#fff',
            fontSize: 14,
            marginBottom: 16,
            boxSizing: 'border-box',
          }}
        />
        {error && <div style={{ color: '#ff6b6b', fontSize: 13, marginBottom: 12 }}>{error}</div>}
        <button
          type="submit"
          disabled={loading || !password}
          style={{
            width: '100%',
            padding: '12px 14px',
            background: '#fff',
            color: '#000',
            border: 'none',
            borderRadius: 4,
            fontSize: 14,
            fontWeight: 500,
            cursor: loading ? 'wait' : 'pointer',
            opacity: loading || !password ? 0.6 : 1,
          }}
        >
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
