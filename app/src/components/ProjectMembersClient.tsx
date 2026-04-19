'use client';

import { useMemo, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Eye, Loader2, Mail, PencilLine, Shield, Trash2, UserPlus } from 'lucide-react';
import type { ProjectInvite, ProjectMember, ProjectRole } from '@/types';

interface Props {
  projectId: string;
  ownerId: string;
  currentUserId: string;
  members: ProjectMember[];
  invites: ProjectInvite[];
}

const ROLE_OPTIONS: { value: ProjectRole; label: string }[] = [
  { value: 'ADMIN', label: 'Admin' },
  { value: 'READ_WRITE', label: 'Read / Write' },
  { value: 'VIEW', label: 'View' },
];

function roleLabel(role: ProjectRole) {
  return ROLE_OPTIONS.find((option) => option.value === role)?.label ?? role;
}

export default function ProjectMembersClient({
  projectId,
  ownerId,
  currentUserId,
  members: initialMembers,
  invites: initialInvites,
}: Props) {
  const [members, setMembers] = useState(initialMembers);
  const [invites, setInvites] = useState(initialInvites);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<ProjectRole>('READ_WRITE');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [workingUserId, setWorkingUserId] = useState<string | null>(null);

  const sortedMembers = useMemo(() => {
    return [...members].sort((a, b) => {
      const aWeight = a.role === 'ADMIN' ? 0 : a.role === 'READ_WRITE' ? 1 : 2;
      const bWeight = b.role === 'ADMIN' ? 0 : b.role === 'READ_WRITE' ? 1 : 2;
      if (aWeight !== bWeight) return aWeight - bWeight;
      return (a.user.name || a.user.email).localeCompare(b.user.name || b.user.email);
    });
  }, [members]);

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const res = await fetch(`/api/projects/${projectId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          name: name.trim() || null,
          role,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Unable to update project users');
        return;
      }

      if (data.type === 'member') {
        setMembers((current) => {
          const existing = current.find((member) => member.userId === data.member.userId);
          if (existing) {
            return current.map((member) => member.userId === data.member.userId ? data.member : member);
          }
          return [...current, data.member];
        });
        setInvites((current) => current.filter((invite) => invite.email !== data.member.user.email));
        setSuccess(`Added ${data.member.user.email} to the project.`);
      } else {
        setInvites((current) => [data.invite, ...current.filter((invite) => invite.email !== data.invite.email)]);
        setSuccess(`Invitation sent to ${data.invite.email}.`);
      }

      setEmail('');
      setName('');
      setRole('READ_WRITE');
    } finally {
      setSaving(false);
    }
  };

  const handleRoleChange = async (userId: string, nextRole: ProjectRole) => {
    setWorkingUserId(userId);
    setError('');
    setSuccess('');

    try {
      const res = await fetch(`/api/projects/${projectId}/members/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: nextRole }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Unable to update role');
        return;
      }

      setMembers((current) => current.map((member) => member.userId === userId ? data : member));
      setSuccess(`Updated ${data.user.email} to ${roleLabel(data.role)}.`);
    } finally {
      setWorkingUserId(null);
    }
  };

  const handleRemove = async (userId: string) => {
    const member = members.find((entry) => entry.userId === userId);
    if (!member) return;
    if (!confirm(`Remove ${member.user.email} from this project?`)) return;

    setWorkingUserId(userId);
    setError('');
    setSuccess('');

    try {
      const res = await fetch(`/api/projects/${projectId}/members/${userId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Unable to remove member');
        return;
      }

      setMembers((current) => current.filter((entry) => entry.userId !== userId));
      setSuccess(`Removed ${member.user.email} from the project.`);
    } finally {
      setWorkingUserId(null);
    }
  };

  return (
    <div style={{ padding: '24px 28px', height: '100%', overflowY: 'auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ color: 'var(--vsc-text)', fontSize: 18, fontWeight: 600, margin: 0 }}>Project Users</h1>
        <p style={{ color: 'var(--vsc-muted)', fontSize: 12, margin: '6px 0 0' }}>
          Admins can manage project access. Existing users are added immediately; new users receive a project invite by email.
        </p>
      </div>

      <div style={{
        background: 'var(--vsc-sidebar)', border: '1px solid var(--vsc-border)',
        borderRadius: 4, padding: 20, marginBottom: 28,
      }}>
        <h2 style={{ color: 'var(--vsc-text)', fontSize: 13, fontWeight: 600, margin: '0 0 14px' }}>
          Add User
        </h2>
        <form onSubmit={handleAddMember} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 240px' }}>
              <label style={{ display: 'block', color: 'var(--vsc-muted)', marginBottom: 4, fontSize: 12 }}>
                Email Address
              </label>
              <input
                className="vsc-input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jane@example.com"
                required
              />
            </div>
            <div style={{ flex: '1 1 220px' }}>
              <label style={{ display: 'block', color: 'var(--vsc-muted)', marginBottom: 4, fontSize: 12 }}>
                Name
              </label>
              <input
                className="vsc-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Optional for new users"
              />
            </div>
            <div style={{ width: 160 }}>
              <label style={{ display: 'block', color: 'var(--vsc-muted)', marginBottom: 4, fontSize: 12 }}>
                Role
              </label>
              <select className="vsc-input" value={role} onChange={(e) => setRole(e.target.value as ProjectRole)}>
                {ROLE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
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
                          color: '#4ec9b0', padding: '8px 12px', borderRadius: 2, fontSize: 12 }}>
              {success}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button type="submit" className="vsc-btn vsc-btn-primary" disabled={saving}>
              {saving ? <Loader2 size={13} className="animate-spin" /> : <UserPlus size={13} />}
              Add User
            </button>
          </div>
        </form>
      </div>

      <div style={{ marginBottom: 28 }}>
        <h2 style={{ color: 'var(--vsc-text)', fontSize: 13, fontWeight: 600, margin: '0 0 12px' }}>
          Members ({sortedMembers.length})
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {sortedMembers.map((member) => {
            const isOwner = member.userId === ownerId;
            const isCurrentUser = member.userId === currentUserId;
            const isWorking = workingUserId === member.userId;

            return (
              <div key={member.id} style={{
                background: 'var(--vsc-sidebar)', border: '1px solid var(--vsc-border)',
                borderRadius: 4, padding: '12px 16px',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
              }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ color: 'var(--vsc-text)', fontSize: 13, fontWeight: 500 }}>
                      {member.user.name || member.user.email}
                    </span>
                    <span style={{ color: 'var(--vsc-muted)', fontSize: 12 }}>{member.user.email}</span>
                    {isOwner && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#4ec9b0', fontSize: 11 }}>
                        <Shield size={11} /> Project creator
                      </span>
                    )}
                    {isCurrentUser && (
                      <span style={{ color: 'var(--vsc-muted)', fontSize: 11 }}>(You)</span>
                    )}
                  </div>
                  <div style={{ color: 'var(--vsc-muted)', fontSize: 11, marginTop: 4 }}>
                    Joined {formatDistanceToNow(new Date(member.createdAt), { addSuffix: true })}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  <select
                    className="vsc-input"
                    value={member.role}
                    disabled={isOwner || isWorking}
                    onChange={(e) => handleRoleChange(member.userId, e.target.value as ProjectRole)}
                    style={{ width: 150 }}
                  >
                    {ROLE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                  <button
                    className="vsc-btn vsc-btn-ghost"
                    disabled={isOwner || isWorking}
                    onClick={() => handleRemove(member.userId)}
                    style={{ padding: '4px 6px', color: '#f44747' }}
                    title={isOwner ? 'The project creator cannot be removed' : 'Remove from project'}
                  >
                    {isWorking ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <h2 style={{ color: 'var(--vsc-text)', fontSize: 13, fontWeight: 600, margin: '0 0 12px' }}>
          Pending Invites ({invites.length})
        </h2>
        {invites.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '36px 20px', color: 'var(--vsc-muted)' }}>
            <Mail size={32} style={{ marginBottom: 10, opacity: 0.3 }} />
            <p style={{ fontSize: 13 }}>No pending invitations for this project.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {invites.map((invite) => (
              <div key={invite.id} style={{
                background: 'var(--vsc-sidebar)', border: '1px solid var(--vsc-border)',
                borderRadius: 4, padding: '12px 16px',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
              }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ color: 'var(--vsc-text)', fontSize: 13, fontWeight: 500 }}>
                      {invite.name || invite.email}
                    </span>
                    {invite.name && (
                      <span style={{ color: 'var(--vsc-muted)', fontSize: 12 }}>{invite.email}</span>
                    )}
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--vsc-muted)', fontSize: 11 }}>
                      {invite.projectRole === 'ADMIN' ? <Shield size={11} /> : invite.projectRole === 'VIEW' ? <Eye size={11} /> : <PencilLine size={11} />}
                      {roleLabel(invite.projectRole)}
                    </span>
                  </div>
                  <div style={{ color: 'var(--vsc-muted)', fontSize: 11, marginTop: 4 }}>
                    Expires {formatDistanceToNow(new Date(invite.expiresAt), { addSuffix: true })}
                  </div>
                </div>
                <span style={{ color: 'var(--vsc-muted)', fontSize: 11, flexShrink: 0 }}>
                  Sent {formatDistanceToNow(new Date(invite.createdAt), { addSuffix: true })}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
