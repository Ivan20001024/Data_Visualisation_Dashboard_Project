'use client';
import { useState } from 'react';
import { signIn } from 'next-auth/react';
import Link from 'next/link';

export default function LoginPage() {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const form = new FormData(e.currentTarget);
    const username = form.get('username');
    const password = form.get('password');

    const res = await signIn('credentials', {
      redirect: false,
      username,
      password,
    });

    setLoading(false);

    if (res?.error) {
      setError(res.error || 'Login failed');
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const back = params.get('from') || '/dashboard';
    window.location.href = back;
  }

  return (
    <main style={{minHeight:'100vh',display:'grid',placeItems:'center',padding:'24px'}}>
      <form onSubmit={onSubmit} style={{width:'100%',maxWidth:420,display:'grid',gap:12}}>
        <h1 style={{textAlign:'center',marginBottom:8}}>Retail Dashboard for AIBUILD Client</h1>

        <input name="username" placeholder="Username" autoComplete="username"
               style={{padding:10,border:'1px solid #ddd',borderRadius:8}} />

        <input name="password" type="password" placeholder="Password" autoComplete="current-password"
               style={{padding:10,border:'1px solid #ddd',borderRadius:8}} />

        <div style={{display:'flex',gap:12,justifyContent:'center',marginTop:4}}>
          <button type="submit" disabled={loading}
                  style={{padding:'10px 16px',borderRadius:8,border:'1px solid #222',cursor:'pointer'}}>
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
          <Link href="/signup"
                style={{padding:'10px 16px',borderRadius:8,border:'1px solid #888',textDecoration:'none'}}>
            Sign up
          </Link>
        </div>

        {error && (
          <div role="alert"
               style={{marginTop:8,background:'#fee',border:'1px solid #f99',color:'#900',padding:10,borderRadius:8}}>
            {error}
          </div>
        )}
      </form>
    </main>
  );
}
