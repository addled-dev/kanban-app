'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, FolderKanban, Trash2, Pencil, Loader2 } from 'lucide-react';
import { Project, PROJECT_COLORS } from '@/types';
import { formatDistanceToNow } from 'date-fns';

interface Props {
  projects: (Project & { _count: { tasks: number } })[];
  userId: string;
}

export default function DashboardClient({ projects: initial }: Props) {
  const router = useRouter();
  const [projects, setProjects] = useState(initial);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState(PROJECT_COLORS[0]);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const openCreate = () => { setName(''); setDescription(''); setColor(PROJECT_COLORS[0]); setEditingId(null); setShowForm(true); };
  const openEdit = (p: Project, e: React.MouseEvent) => {
    e.stopPropagation();
    setName(p.name); setDescription(p.description || ''); setColor(p.color);
    setEditingId(p.id); setShowForm(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      if (editingId) {
        const res = await fetch(`/api/projects/${editingId}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, description: description || null, color }),
        });
        const updated = await res.json();
        setProjects(projects.map(p => p.id === editingId ? { ...p, ...updated } : p));
      } else {
        const res = await fetch('/api/projects', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, description: description || null, color }),
        });
        setProjects([await res.json(), ...projects]);
      }
      setShowForm(false);
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Delete this project and all its tasks?')) return;
    setDeletingId(id);
    try {
      await fetch(`/api/projects/${id}`, { method: 'DELETE' });
      setProjects(projects.filter(p => p.id !== id));
    } finally { setDeletingId(null); }
  };

  return (
    <div style={{ padding: '24px 28px', height: '100%', overflowY: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ color: 'var(--vsc-text)', fontSize: 18, fontWeight: 600, margin: 0 }}>Projects</h1>
          <p style={{ color: 'var(--vsc-muted)', fontSize: 12, margin: '4px 0 0' }}>
            {projects.length} project{projects.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button className="vsc-btn vsc-btn-primary" onClick={openCreate}>
          <Plus size={14} /> New Project
        </button>
      </div>

      {showForm && (
        <div style={{ background: 'var(--vsc-sidebar)', border: '1px solid var(--vsc-border)',
                      borderRadius: 4, padding: 20, marginBottom: 24 }}>
          <h2 style={{ color: 'var(--vsc-text)', fontSize: 14, fontWeight: 600, margin: '0 0 16px' }}>
            {editingId ? 'Edit Project' : 'New Project'}
          </h2>
          <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={{ display: 'block', color: 'var(--vsc-muted)', marginBottom: 4, fontSize: 12 }}>Name *</label>
              <input className="vsc-input" value={name} onChange={e => setName(e.target.value)}
                placeholder="My Project" required autoFocus />
            </div>
            <div>
              <label style={{ display: 'block', color: 'var(--vsc-muted)', marginBottom: 4, fontSize: 12 }}>Description</label>
              <textarea className="vsc-input" value={description} onChange={e => setDescription(e.target.value)}
                placeholder="Optional description" rows={2} style={{ resize: 'vertical' }} />
            </div>
            <div>
              <label style={{ display: 'block', color: 'var(--vsc-muted)', marginBottom: 6, fontSize: 12 }}>Color</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {PROJECT_COLORS.map(c => (
                  <button key={c} type="button" onClick={() => setColor(c)} style={{
                    width: 22, height: 22, borderRadius: '50%', background: c, padding: 0,
                    border: color === c ? '2px solid var(--vsc-text)' : '2px solid transparent',
                    cursor: 'pointer', outline: 'none',
                  }} />
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
              <button type="button" className="vsc-btn vsc-btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
              <button type="submit" className="vsc-btn vsc-btn-primary" disabled={saving}>
                {saving && <Loader2 size={13} className="animate-spin" />}
                {editingId ? 'Save' : 'Create'}
              </button>
            </div>
          </form>
        </div>
      )}

      {projects.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--vsc-muted)' }}>
          <FolderKanban size={48} style={{ marginBottom: 12, opacity: 0.3 }} />
          <p style={{ fontSize: 14 }}>No projects yet. Create your first one!</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
          {projects.map(project => (
            <div key={project.id} onClick={() => router.push(`/projects/${project.id}`)}
              style={{ background: 'var(--vsc-sidebar)', border: '1px solid var(--vsc-border)',
                       borderTop: `3px solid ${project.color}`, borderRadius: 4,
                       padding: '16px 18px', cursor: 'pointer', transition: 'background 0.1s' }}
              onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = 'var(--vsc-hover)'}
              onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = 'var(--vsc-sidebar)'}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: project.color, flexShrink: 0 }} />
                  <span style={{ color: 'var(--vsc-text)', fontSize: 14, fontWeight: 600,
                                 overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {project.name}
                  </span>
                  <span style={{ background: 'var(--vsc-hover)', color: 'var(--vsc-muted)',
                                 fontSize: 10, padding: '2px 6px', borderRadius: 10, fontWeight: 600 }}>
                    {project.membershipRole === 'READ_WRITE' ? 'READ / WRITE' : project.membershipRole}
                  </span>
                </div>
                {project.membershipRole === 'ADMIN' && (
                  <div style={{ display: 'flex', gap: 4, flexShrink: 0, marginLeft: 8 }}>
                    <button onClick={e => openEdit(project, e)} className="vsc-btn vsc-btn-ghost"
                      style={{ padding: '2px 4px' }} title="Edit"><Pencil size={12} /></button>
                    <button onClick={e => handleDelete(project.id, e)} className="vsc-btn vsc-btn-ghost"
                      style={{ padding: '2px 4px', color: '#f44747' }} disabled={deletingId === project.id}>
                      {deletingId === project.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                    </button>
                  </div>
                )}
              </div>
              {project.description && (
                <p style={{ color: 'var(--vsc-muted)', fontSize: 12, margin: '0 0 10px',
                            display: '-webkit-box', WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {project.description}
                </p>
              )}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
                <span style={{ background: `${project.color}22`, color: project.color,
                               fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 500 }}>
                  {project._count?.tasks ?? 0} task{(project._count?.tasks ?? 0) !== 1 ? 's' : ''}
                </span>
                <span style={{ color: 'var(--vsc-muted)', fontSize: 11 }}>
                  {formatDistanceToNow(new Date(project.updatedAt), { addSuffix: true })}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
