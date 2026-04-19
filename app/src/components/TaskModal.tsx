'use client';

import { useState, useRef, useEffect } from 'react';
import { X, Trash2, Loader2, Paperclip, Plus, Calendar, Tag, User, AlertCircle } from 'lucide-react';
import { Task, TaskStatus, Priority, COLUMNS, PRIORITY_CONFIG } from '@/types';
import { format } from 'date-fns';

interface Props {
  task: Task | null;
  defaultStatus?: TaskStatus;
  projectId: string;
  currentUserId: string;
  currentUserEmail: string;
  currentUserName: string | null;
  readOnly: boolean;
  onCreated: (t: Task) => void;
  onUpdated: (t: Task) => void;
  onDeleted: (id: string) => void;
  onClose: () => void;
}

export default function TaskModal({
  task, defaultStatus, projectId, currentUserId, currentUserEmail, currentUserName,
  readOnly,
  onCreated, onUpdated, onDeleted, onClose,
}: Props) {
  const isNew = !task;
  const [title, setTitle] = useState(task?.title ?? '');
  const [description, setDescription] = useState(task?.description ?? '');
  const [status, setStatus] = useState<TaskStatus>(task?.status ?? defaultStatus ?? 'BACKLOG');
  const [priority, setPriority] = useState<Priority | ''>(task?.priority ?? '');
  const [dueDate, setDueDate] = useState(task?.dueDate ? format(new Date(task.dueDate), 'yyyy-MM-dd') : '');
  const [labels, setLabels] = useState<string[]>(task?.labels ?? []);
  const [labelInput, setLabelInput] = useState('');
  const [selfAssigned, setSelfAssigned] = useState(task?.assigneeId === currentUserId);
  const [attachments, setAttachments] = useState(task?.attachments ?? []);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const titleRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { titleRef.current?.focus(); }, []);
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const addLabel = () => {
    const l = labelInput.trim();
    if (l && !labels.includes(l) && labels.length < 10) { setLabels([...labels, l]); setLabelInput(''); }
  };

  const handleSave = async () => {
    if (readOnly) return;
    if (!title.trim()) { setError('Title is required'); return; }
    setSaving(true); setError('');
    const payload = {
      title: title.trim(), description: description.trim() || null, status,
      priority: priority || null, dueDate: dueDate ? new Date(dueDate).toISOString() : null,
      labels, assigneeId: selfAssigned ? currentUserId : null, projectId,
    };
    try {
      if (isNew) {
        const res = await fetch('/api/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (!res.ok) { setError((await res.json()).error); return; }
        onCreated(await res.json());
      } else {
        const res = await fetch(`/api/tasks/${task!.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: payload.title, description: payload.description,
            priority: payload.priority, dueDate: payload.dueDate, labels: payload.labels,
            assigneeId: payload.assigneeId }),
        });
        if (!res.ok) { setError((await res.json()).error); return; }
        let updated = await res.json();
        if (status !== task!.status) {
          const mv = await fetch(`/api/tasks/${task!.id}/move`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status }),
          });
          if (mv.ok) updated = await mv.json();
        }
        onUpdated({ ...updated, attachments });
      }
    } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (readOnly) return;
    if (!task || !confirm('Delete this task?')) return;
    setDeleting(true);
    try { await fetch(`/api/tasks/${task.id}`, { method: 'DELETE' }); onDeleted(task.id); }
    finally { setDeleting(false); }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (readOnly) return;
    if (!task || !e.target.files?.length) return;
    setUploading(true);
    try {
      for (const file of Array.from(e.target.files)) {
        const fd = new FormData(); fd.append('file', file); fd.append('taskId', task.id);
        const res = await fetch('/api/upload', { method: 'POST', body: fd });
        if (res.ok) {
          const attachment = await res.json();
          setAttachments(p => [...p, attachment]);
        }
      }
    } finally { setUploading(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  const handleDeleteAttachment = async (id: string, url: string) => {
    if (readOnly) return;
    const parts = url.split('/api/files/')[1]?.split('/');
    if (!parts) return;
    await fetch(`/api/files/${parts[0]}/${parts[1]}`, { method: 'DELETE' });
    setAttachments(p => p.filter(a => a.id !== id));
  };

  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.5)',
               display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: 'var(--vsc-bg)', border: '1px solid var(--vsc-border)', borderRadius: 4,
                    width: '100%', maxWidth: 640, maxHeight: '90vh',
                    display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--vsc-border)',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <span style={{ color: 'var(--vsc-text)', fontSize: 13, fontWeight: 600 }}>
            {isNew ? 'New Task' : readOnly ? 'View Task' : 'Edit Task'}
          </span>
          <button className="vsc-btn vsc-btn-ghost" onClick={onClose} style={{ padding: '3px 6px' }}>
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div style={{ overflowY: 'auto', flex: 1, padding: 16 }}>
          {error && (
            <div style={{ background: 'rgba(244,71,71,0.1)', border: '1px solid rgba(244,71,71,0.4)',
                          color: '#f44747', padding: '8px 12px', borderRadius: 2, fontSize: 12,
                          marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
              <AlertCircle size={13} />{error}
            </div>
          )}

          <div style={{ marginBottom: 14 }}>
            <input ref={titleRef} className="vsc-input" value={title} onChange={e => setTitle(e.target.value)}
              placeholder="Task title" style={{ fontSize: 15, fontWeight: 500 }}
              disabled={readOnly}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) handleSave(); }} />
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', color: 'var(--vsc-muted)', marginBottom: 4, fontSize: 12 }}>Description</label>
            <textarea className="vsc-input" value={description} onChange={e => setDescription(e.target.value)}
              placeholder="Add details..." rows={4} disabled={readOnly}
              style={{ resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }} />
          </div>

          <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', color: 'var(--vsc-muted)', marginBottom: 4, fontSize: 12 }}>Status</label>
              <select className="vsc-input" value={status} onChange={e => setStatus(e.target.value as TaskStatus)} style={{ cursor: readOnly ? 'default' : 'pointer' }} disabled={readOnly}>
                {COLUMNS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', color: 'var(--vsc-muted)', marginBottom: 4, fontSize: 12 }}>Priority</label>
              <select className="vsc-input" value={priority} onChange={e => setPriority(e.target.value as Priority | '')} style={{ cursor: readOnly ? 'default' : 'pointer' }} disabled={readOnly}>
                <option value="">None</option>
                {(['LOW','MEDIUM','HIGH'] as Priority[]).map(p => <option key={p} value={p}>{PRIORITY_CONFIG[p].label}</option>)}
              </select>
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', color: 'var(--vsc-muted)', marginBottom: 4, fontSize: 12 }}>
              <Calendar size={11} style={{ display: 'inline', marginRight: 4 }} />Due Date
            </label>
            <input className="vsc-input" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} disabled={readOnly} />
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', color: 'var(--vsc-muted)', marginBottom: 4, fontSize: 12 }}>
              <Tag size={11} style={{ display: 'inline', marginRight: 4 }} />Labels
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: labels.length ? 6 : 0 }}>
              {labels.map(l => (
                <span key={l} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10,
                                       background: 'rgba(128,128,128,0.15)', color: 'var(--vsc-text)',
                                       display: 'flex', alignItems: 'center', gap: 4 }}>
                  {l}
                  {!readOnly && (
                    <button onClick={() => setLabels(labels.filter(x => x !== l))}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                             color: 'var(--vsc-muted)', display: 'flex' }}>
                      <X size={10} />
                    </button>
                  )}
                </span>
              ))}
            </div>
            {!readOnly && (
              <div style={{ display: 'flex', gap: 6 }}>
              <input className="vsc-input" value={labelInput} onChange={e => setLabelInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addLabel(); } }}
                placeholder="Add label..." style={{ flex: 1 }} />
              <button className="vsc-btn vsc-btn-secondary" onClick={addLabel}><Plus size={12} /></button>
              </div>
            )}
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', color: 'var(--vsc-muted)', marginBottom: 4, fontSize: 12 }}>
              <User size={11} style={{ display: 'inline', marginRight: 4 }} />Assignee
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={selfAssigned} onChange={e => setSelfAssigned(e.target.checked)}
                disabled={readOnly}
                style={{ cursor: 'pointer', accentColor: 'var(--vsc-accent)' }} />
              <span style={{ color: 'var(--vsc-text)', fontSize: 13 }}>
                Assign to me ({currentUserName || currentUserEmail})
              </span>
            </label>
          </div>

          {!isNew && (
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', color: 'var(--vsc-muted)', marginBottom: 6, fontSize: 12 }}>
                <Paperclip size={11} style={{ display: 'inline', marginRight: 4 }} />Attachments
              </label>
              {attachments.length > 0 && (
                <div style={{ marginBottom: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {attachments.map(att => (
                    <div key={att.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                               padding: '5px 10px', background: 'var(--vsc-sidebar)',
                                               border: '1px solid var(--vsc-border)', borderRadius: 2 }}>
                      <a href={att.url} target="_blank" rel="noopener noreferrer"
                        style={{ color: 'var(--vsc-accent)', fontSize: 12, textDecoration: 'none',
                                 overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {att.filename}
                      </a>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, marginLeft: 8 }}>
                        <span style={{ color: 'var(--vsc-muted)', fontSize: 11 }}>
                          {(att.size / 1024).toFixed(0)} KB
                        </span>
                        {!readOnly && (
                          <button onClick={() => handleDeleteAttachment(att.id, att.url)}
                          className="vsc-btn vsc-btn-ghost" style={{ padding: '2px 4px', color: '#f44747' }}>
                            <X size={11} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {!readOnly && (
                <>
                  <input ref={fileRef} type="file" multiple onChange={handleUpload} style={{ display: 'none' }} />
                  <button className="vsc-btn vsc-btn-secondary" onClick={() => fileRef.current?.click()}
                    disabled={uploading} style={{ fontSize: 12 }}>
                    {uploading ? <><Loader2 size={12} className="animate-spin" />Uploading...</>
                               : <><Paperclip size={12} />Attach file</>}
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 16px', borderTop: '1px solid var(--vsc-border)',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      flexShrink: 0, background: 'var(--vsc-sidebar)' }}>
          <div>
            {!isNew && !readOnly && (
              <button className="vsc-btn vsc-btn-danger" onClick={handleDelete} disabled={deleting} style={{ fontSize: 12 }}>
                {deleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}Delete
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="vsc-btn vsc-btn-secondary" onClick={onClose}>{readOnly ? 'Close' : 'Cancel'}</button>
            {!readOnly && (
              <button className="vsc-btn vsc-btn-primary" onClick={handleSave} disabled={saving}>
                {saving && <Loader2 size={12} className="animate-spin" />}
                {isNew ? 'Create Task' : 'Save'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
