'use client';
import { useState } from 'react';

export default function SignUpForm({ onSuccess }) {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const form = new FormData(e.currentTarget);
    const username = (form.get('username') || '').trim();
    const password = (form.get('password') || '').trim();

    if (!username || !password) {
      setLoading(false);
      setError('Username or password cannot be empty');
      return;
    }

    const res = await fetch('/api/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    setLoading(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data?.message || 'Sign up failed');
      return;
    }

    if (onSuccess) onSuccess();
    else window.location.href = '/login';
  }

  return (
    <form onSubmit={onSubmit} style={{ width: '100%', maxWidth: 420, display: 'grid', gap: 12 }}>
      <h1 style={{ textAlign: 'center', marginBottom: 8 }}>Sign Up</h1>

      <input
        name="username"
        placeholder="Username"
        autoComplete="username"
        style={{ padding: 10, border: '1px solid #ddd', borderRadius: 8 }}
      />

      <input
        name="password"
        type="password"
        placeholder="Password"
        autoComplete="new-password"
        style={{ padding: 10, border: '1px solid #ddd', borderRadius: 8 }}
      />

      <button
        type="submit"
        disabled={loading}
        style={{ padding: '10px 16px', borderRadius: 8, border: '1px solid #222', cursor: 'pointer' }}
      >
        {loading ? 'Signing up…' : 'Sign up'}
      </button>

      {error && (
        <div
          role="alert"
          style={{ marginTop: 8, background: '#fee', border: '1px solid #f99', color: '#900', padding: 10, borderRadius: 8 }}
        >
          {error}
        </div>
      )}
    </form>
  );
}
