'use client';

import { useState } from 'react';
import { Plus, Loader2, UserPlus, Mail, CheckCircle, Clock, XCircle } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';

interface Invite {
  id: string;
  email: string;
  name: string;
  expiresAt: string;
  usedAt: string | null;
  createdAt: string;
}

interface Props { invites: Invite[] }

function InviteStatus({ invite }: { invite: Invite }) {
  if (invite.usedAt) return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#4ec9b0', fontSize: 11 }}>
      <CheckCircle size={11} /> Accepted {formatDistanceToNow(new Date(invite.usedAt), { addSuffix: true })}
    </span>
  );
  if (new Date(invite.expiresAt) < new Date()) return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#f44747', fontSize: 11 }}>
      <XCircle size={11} /> Expired
    </span>
  );
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#fde047', fontSize: 11 }}>
      <Clock size={11} /> Pending · expires {formatDistanceToNow(new Date(invite.expiresAt), { addSuffix: true })}
    </span>
  );
}

export default function InviteClient({ invites: initial }: Props) {
  const [invites, setInvites] = useState(initial);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setSuccess(''); setSaving(true);
    try {
      const res = await fetch('/api/auth/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), email: email.toLowerCase().trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      setInvites(prev => [data, ...prev]);
      setSuccess(`Invitation sent to ${data.email}`);
      setName(''); setEmail('');
    } finally { setSaving(false); }
  };

  return (
    <div style={{ padding: '24px 28px', height: '100%', overflowY: 'auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ color: 'var(--vsc-text)', fontSize: 18, fontWeight: 600, margin: 0 }}>Invite Users</h1>
        <p style={{ color: 'var(--vsc-muted)', fontSize: 12, margin: '6px 0 0' }}>
          This board is invite-only. Send an email invitation to grant someone access.
          Invitations expire after 72 hours.
        </p>
      </div>

      {/* Invite form */}
      <div style={{
        background: 'var(--vsc-sidebar)', border: '1px solid var(--vsc-border)',
        borderRadius: 4, padding: 20, marginBottom: 28,
      }}>
        <h2 style={{ color: 'var(--vsc-text)', fontSize: 13, fontWeight: 600, margin: '0 0 14px' }}>
          Send Invitation
        </h2>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', color: 'var(--vsc-muted)', marginBottom: 4, fontSize: 12 }}>
                Full Name
              </label>
              <input className="vsc-input" value={name} onChange={e => setName(e.target.value)}
                placeholder="Jane Smith" required />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', color: 'var(--vsc-muted)', marginBottom: 4, fontSize: 12 }}>
                Email Address
              </label>
              <input className="vsc-input" type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="jane@example.com" required />
            </div>
          </div>

          {error && (
            <div style={{ background: 'rgba(244,71,71,0.1)', border: '1px solid rgba(244,71,71,0.4)',
                          color: '#f44747', padding: '8px 12px', borderRadius: 2, fontSize: 12 }}>
              {error}
            </div>
          )}
          {success && (
            <div style={{ background: 'rgba(78,201,176,0.1)', border: '1px solid rgba(78,201,176,0.4)',
                          color: '#4ec9b0', padding: '8px 12px', borderRadius: 2, fontSize: 12,
                          display: 'flex', alignItems: 'center', gap: 6 }}>
              <Mail size={13} /> {success}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button type="submit" className="vsc-btn vsc-btn-primary" disabled={saving}>
              {saving ? <Loader2 size={13} className="animate-spin" /> : <UserPlus size={13} />}
              Send Invitation
            </button>
          </div>
        </form>
      </div>

      {/* Invite history */}
      <div>
        <h2 style={{ color: 'var(--vsc-text)', fontSize: 13, fontWeight: 600, margin: '0 0 12px' }}>
          Invitation History ({invites.length})
        </h2>
        {invites.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--vsc-muted)' }}>
            <UserPlus size={36} style={{ marginBottom: 10, opacity: 0.3 }} />
            <p style={{ fontSize: 13 }}>No invitations sent yet.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {invites.map(inv => (
              <div key={inv.id} style={{
                background: 'var(--vsc-sidebar)', border: '1px solid var(--vsc-border)',
                borderRadius: 4, padding: '12px 16px',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
              }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ color: 'var(--vsc-text)', fontSize: 13, fontWeight: 500 }}>
                      {inv.name}
                    </span>
                    <span style={{ color: 'var(--vsc-muted)', fontSize: 12 }}>{inv.email}</span>
                  </div>
                  <div style={{ marginTop: 4 }}>
                    <InviteStatus invite={inv} />
                  </div>
                </div>
                <div style={{ color: 'var(--vsc-muted)', fontSize: 11, flexShrink: 0 }}>
                  {format(new Date(inv.createdAt), 'MMM d, yyyy')}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
