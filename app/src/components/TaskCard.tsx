'use client';

import { Task, TaskStatus, PRIORITY_CONFIG, WORK_ITEM_TYPE_CONFIG } from '@/types';
import { Calendar, Paperclip } from 'lucide-react';
import { format, isPast, isToday } from 'date-fns';

const STATUS_CLASS: Record<TaskStatus, string> = {
  BACKLOG: 'postit-backlog', TODO: 'postit-todo', IN_PROGRESS: 'postit-in-progress',
  REVIEW: 'postit-review', DONE: 'postit-done',
};

interface Props { task: Task; status: TaskStatus; isDragging: boolean; onClick: () => void; }

export default function TaskCard({ task, status, isDragging, onClick }: Props) {
  const typeConfig = WORK_ITEM_TYPE_CONFIG[task.type];
  const dueDateColor = task.dueDate
    ? isToday(new Date(task.dueDate)) ? '#ca8a04'
      : isPast(new Date(task.dueDate)) ? '#dc2626'
      : 'var(--vsc-muted)'
    : null;

  return (
    <div className={`postit ${STATUS_CLASS[status]} ${isDragging ? 'postit-dragging' : ''}`}
      onClick={onClick} style={{ padding: '10px 12px', cursor: 'pointer', userSelect: 'none' }}>
      {/* Priority + title */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: 6 }}>
        <span
          title={typeConfig.label}
          style={{
            width: 18,
            height: 18,
            borderRadius: '50%',
            flexShrink: 0,
            background: `${typeConfig.color}22`,
            color: typeConfig.color,
            border: `1px solid ${typeConfig.color}66`,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 10,
            fontWeight: 700,
            lineHeight: 1,
            marginTop: 1,
          }}
        >
          {typeConfig.symbol}
        </span>
        {task.priority && (
          <span style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, marginTop: 4,
                         background: PRIORITY_CONFIG[task.priority].color }}
            title={`Priority: ${PRIORITY_CONFIG[task.priority].label}`} />
        )}
        <span style={{ color: 'var(--vsc-text)', fontSize: 13, fontWeight: 500, lineHeight: 1.4,
                       textDecoration: status === 'DONE' ? 'line-through' : 'none',
                       opacity: status === 'DONE' ? 0.6 : 1 }}>
          {task.title}
        </span>
      </div>

      {/* Description snippet */}
      {task.description && (
        <p style={{ color: 'var(--vsc-muted)', fontSize: 11, margin: '0 0 8px', lineHeight: 1.4,
                    display: '-webkit-box', WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {task.description}
        </p>
      )}

      {/* Labels */}
      {task.labels.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
          {task.labels.slice(0, 3).map(l => (
            <span key={l} style={{ fontSize: 10, padding: '1px 6px', borderRadius: 10,
                                   background: 'rgba(128,128,128,0.15)', color: 'var(--vsc-muted)' }}>
              {l}
            </span>
          ))}
          {task.labels.length > 3 && (
            <span style={{ fontSize: 10, color: 'var(--vsc-muted)' }}>+{task.labels.length - 3}</span>
          )}
        </div>
      )}

      {/* Footer */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {task.dueDate && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11,
                         color: dueDateColor ?? 'var(--vsc-muted)' }}>
            <Calendar size={11} />{format(new Date(task.dueDate), 'MMM d')}
          </span>
        )}
        {task.attachments.length > 0 && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, color: 'var(--vsc-muted)' }}>
            <Paperclip size={11} />{task.attachments.length}
          </span>
        )}
        {task.assignee && (
          <span title={task.assignee.name || task.assignee.email}
            style={{ marginLeft: 'auto', width: 20, height: 20, borderRadius: '50%',
                     background: 'var(--vsc-accent)', color: '#fff', fontSize: 10,
                     display: 'flex', alignItems: 'center', justifyContent: 'center',
                     fontWeight: 600, flexShrink: 0 }}>
            {(task.assignee.name || task.assignee.email).charAt(0).toUpperCase()}
          </span>
        )}
      </div>
    </div>
  );
}
