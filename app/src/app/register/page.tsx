'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Eye, EyeOff, Loader2, Code2 } from 'lucide-react';

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Registration failed');
        return;
      }

      router.push('/login?registered=1');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: 'var(--vsc-sidebar)' }}
    >
      <div
        className="w-full max-w-sm animate-slide-up"
        style={{
          background: 'var(--vsc-bg)',
          border: '1px solid var(--vsc-border)',
          borderRadius: 4,
          padding: 32,
        }}
      >
        <div className="flex items-center gap-2 mb-8">
          <Code2 size={22} style={{ color: 'var(--vsc-accent)' }} />
          <span style={{ color: 'var(--vsc-text)', fontWeight: 600, fontSize: 16 }}>
            Kanban Board
          </span>
        </div>

        <p style={{ color: 'var(--vsc-muted)', marginBottom: 20, fontSize: 13 }}>
          Create your account
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ display: 'block', color: 'var(--vsc-muted)', marginBottom: 4, fontSize: 12 }}>
              Name
            </label>
            <input
              className="vsc-input"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              required
              autoFocus
            />
          </div>

          <div>
            <label style={{ display: 'block', color: 'var(--vsc-muted)', marginBottom: 4, fontSize: 12 }}>
              Email
            </label>
            <input
              className="vsc-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
          </div>

          <div>
            <label style={{ display: 'block', color: 'var(--vsc-muted)', marginBottom: 4, fontSize: 12 }}>
              Password
            </label>
            <div style={{ position: 'relative' }}>
              <input
                className="vsc-input"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min. 8 characters"
                required
                minLength={8}
                style={{ paddingRight: 36 }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer', color: 'var(--vsc-muted)',
                  padding: 2, display: 'flex',
                }}
              >
                {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          {error && (
            <div style={{
              background: 'rgba(244,71,71,0.1)', border: '1px solid rgba(244,71,71,0.4)',
              color: '#f44747', padding: '8px 12px', borderRadius: 2, fontSize: 12,
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            className="vsc-btn vsc-btn-primary"
            disabled={loading}
            style={{ justifyContent: 'center', marginTop: 4 }}
          >
            {loading && <Loader2 size={14} className="animate-spin" />}
            Create Account
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: 20, color: 'var(--vsc-muted)', fontSize: 12 }}>
          Already have an account?{' '}
          <Link href="/login" style={{ color: 'var(--vsc-accent)' }}>
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
