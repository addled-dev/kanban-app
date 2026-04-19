'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Code2, Eye, EyeOff, AlertCircle, CheckCircle } from 'lucide-react';

export default function InvitePage({ params }: { params: { token: string } }) {
  const router = useRouter();
  const [info, setInfo] = useState<{
    email: string;
    name: string | null;
    projectName: string | null;
    projectRole: 'ADMIN' | 'READ_WRITE' | 'VIEW' | null;
  } | null>(null);
  const [tokenError, setTokenError] = useState('');
  const [validating, setValidating] = useState(true);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch(`/api/auth/invite/${params.token}`)
      .then(async r => {
        if (r.ok) setInfo(await r.json());
        else setTokenError((await r.json()).error);
      })
      .catch(() => setTokenError('Unable to validate invite link'))
      .finally(() => setValidating(false));
  }, [params.token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) { setError('Passwords do not match'); return; }
    setError(''); setLoading(true);
    try {
      const res = await fetch(`/api/auth/invite/${params.token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) setError((await res.json()).error);
      else router.push('/login?invited=1');
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

        {validating ? (
          <div style={{ textAlign: 'center', padding: 24 }}>
            <Loader2 size={24} className="animate-spin" style={{ color: 'var(--vsc-accent)', margin: '0 auto' }} />
          </div>
        ) : tokenError ? (
          <div style={{ textAlign: 'center' }}>
            <AlertCircle size={32} style={{ color: '#f44747', margin: '0 auto 12px' }} />
            <p style={{ color: '#f44747', fontSize: 13, marginBottom: 8 }}>{tokenError}</p>
            <p style={{ color: 'var(--vsc-muted)', fontSize: 12 }}>
              Ask an admin to send a new invitation.
            </p>
          </div>
        ) : info && (
          <>
            <div style={{ marginBottom: 20 }}>
              <p style={{ color: 'var(--vsc-text)', fontSize: 14, fontWeight: 500, marginBottom: 4 }}>
                Welcome, {info.name || info.email}!
              </p>
              <p style={{ color: 'var(--vsc-muted)', fontSize: 13 }}>
                {info.projectName
                  ? <>You've been invited to join <strong>{info.projectName}</strong>. Set a password to complete your account.</>
                  : <>You've been invited to join Kanban Board. Set a password to complete your account.</>}
              </p>
              <div style={{ marginTop: 10, padding: '6px 10px', background: 'var(--vsc-hover)',
                            borderRadius: 2, fontSize: 12, color: 'var(--vsc-muted)' }}>
                Signing in as: <strong style={{ color: 'var(--vsc-text)' }}>{info.email}</strong>
              </div>
            </div>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {['Password', 'Confirm Password'].map((label, i) => {
                const val = i === 0 ? password : confirm;
                const setter = i === 0 ? setPassword : setConfirm;
                return (
                  <div key={label}>
                    <label style={{ display: 'block', color: 'var(--vsc-muted)', marginBottom: 4, fontSize: 12 }}>{label}</label>
                    <div style={{ position: 'relative' }}>
                      <input className="vsc-input" type={showPw ? 'text' : 'password'} value={val}
                        onChange={e => setter(e.target.value)} placeholder="Min. 8 characters"
                        required minLength={8} style={{ paddingRight: i === 0 ? 36 : undefined }} autoFocus={i === 0} />
                      {i === 0 && (
                        <button type="button" onClick={() => setShowPw(!showPw)}
                          style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                                   background: 'none', border: 'none', cursor: 'pointer',
                                   color: 'var(--vsc-muted)', padding: 2, display: 'flex' }}>
                          {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
              {error && (
                <div style={{ background: 'rgba(244,71,71,0.1)', border: '1px solid rgba(244,71,71,0.4)',
                              color: '#f44747', padding: '8px 12px', borderRadius: 2, fontSize: 12 }}>
                  {error}
                </div>
              )}
              <button type="submit" className="vsc-btn vsc-btn-primary"
                      disabled={loading} style={{ justifyContent: 'center', marginTop: 4 }}>
                {loading && <Loader2 size={14} className="animate-spin" />} Create Account
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
