'use client';

import { Suspense, useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Eye, EyeOff, Loader2, Code2 } from 'lucide-react';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const success = params.get('reset') === '1' ? 'Password updated — sign in below.'
    : params.get('invited') === '1' ? 'Account created — sign in below.' : null;
  const callbackUrl = params.get('callbackUrl');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const res = await signIn('credentials', {
        email: email.toLowerCase().trim(), password, redirect: false,
      });
      if (res?.error) setError(res.error);
      else { router.push(callbackUrl || '/dashboard'); router.refresh(); }
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center"
         style={{ background: 'var(--vsc-sidebar)' }}>
      <div className="w-full max-w-sm animate-slide-up"
           style={{ background: 'var(--vsc-bg)', border: '1px solid var(--vsc-border)',
                    borderRadius: 4, padding: 32 }}>
        <div className="flex items-center gap-2 mb-8">
          <Code2 size={22} style={{ color: 'var(--vsc-accent)' }} />
          <span style={{ color: 'var(--vsc-text)', fontWeight: 600, fontSize: 16 }}>Kanban Board</span>
        </div>

        {success && (
          <div style={{ background: 'rgba(78,201,176,0.12)', border: '1px solid #4ec9b0',
                        color: '#4ec9b0', padding: '8px 12px', borderRadius: 2,
                        fontSize: 12, marginBottom: 16 }}>
            {success}
          </div>
        )}

        <p style={{ color: 'var(--vsc-muted)', marginBottom: 20, fontSize: 13 }}>Sign in to your account</p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ display: 'block', color: 'var(--vsc-muted)', marginBottom: 4, fontSize: 12 }}>Email</label>
            <input className="vsc-input" type="email" value={email}
              onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required autoFocus />
          </div>
          <div>
            <label style={{ display: 'block', color: 'var(--vsc-muted)', marginBottom: 4, fontSize: 12 }}>Password</label>
            <div style={{ position: 'relative' }}>
              <input className="vsc-input" type={showPw ? 'text' : 'password'} value={password}
                onChange={e => setPassword(e.target.value)} placeholder="••••••••"
                required style={{ paddingRight: 36 }} />
              <button type="button" onClick={() => setShowPw(!showPw)}
                style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                         background: 'none', border: 'none', cursor: 'pointer',
                         color: 'var(--vsc-muted)', padding: 2, display: 'flex' }}>
                {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          {error && (
            <div style={{ background: 'rgba(244,71,71,0.1)', border: '1px solid rgba(244,71,71,0.4)',
                          color: '#f44747', padding: '8px 12px', borderRadius: 2, fontSize: 12 }}>
              {error}
            </div>
          )}

          <button type="submit" className="vsc-btn vsc-btn-primary"
                  disabled={loading} style={{ justifyContent: 'center', marginTop: 4 }}>
            {loading && <Loader2 size={14} className="animate-spin" />} Sign In
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: 16, color: 'var(--vsc-muted)', fontSize: 12 }}>
          <Link href="/forgot-password" style={{ color: 'var(--vsc-accent)' }}>Forgot password?</Link>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
