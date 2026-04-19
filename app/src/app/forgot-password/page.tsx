'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Loader2, Code2, ArrowLeft, Mail } from 'lucide-react';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) setError((await res.json()).error);
      else setSent(true);
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

        {sent ? (
          <div style={{ textAlign: 'center', padding: '12px 0' }}>
            <Mail size={36} style={{ color: 'var(--vsc-accent)', margin: '0 auto 16px' }} />
            <p style={{ color: 'var(--vsc-text)', fontSize: 14, fontWeight: 500, marginBottom: 8 }}>Check your email</p>
            <p style={{ color: 'var(--vsc-muted)', fontSize: 13, marginBottom: 20 }}>
              If an account exists for <strong>{email}</strong>, a password reset link has been sent. It expires in 1 hour.
            </p>
            <Link href="/login" style={{ color: 'var(--vsc-accent)', fontSize: 13 }}>Back to sign in</Link>
          </div>
        ) : (
          <>
            <p style={{ color: 'var(--vsc-muted)', marginBottom: 20, fontSize: 13 }}>
              Enter your email and we'll send you a reset link.
            </p>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', color: 'var(--vsc-muted)', marginBottom: 4, fontSize: 12 }}>Email</label>
                <input className="vsc-input" type="email" value={email}
                  onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required autoFocus />
              </div>
              {error && (
                <div style={{ background: 'rgba(244,71,71,0.1)', border: '1px solid rgba(244,71,71,0.4)',
                              color: '#f44747', padding: '8px 12px', borderRadius: 2, fontSize: 12 }}>
                  {error}
                </div>
              )}
              <button type="submit" className="vsc-btn vsc-btn-primary"
                      disabled={loading} style={{ justifyContent: 'center' }}>
                {loading && <Loader2 size={14} className="animate-spin" />} Send Reset Link
              </button>
            </form>
            <p style={{ textAlign: 'center', marginTop: 16, color: 'var(--vsc-muted)', fontSize: 12 }}>
              <Link href="/login" style={{ color: 'var(--vsc-accent)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <ArrowLeft size={12} /> Back to sign in
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
