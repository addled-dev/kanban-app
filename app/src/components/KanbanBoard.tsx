'use client';

import { useState, useCallback } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { Plus } from 'lucide-react';
import { Task, TaskStatus, COLUMNS, COLUMN_STYLES, Project } from '@/types';
import TaskCard from './TaskCard';
import TaskModal from './TaskModal';

interface Props {
  project: Project;
  initialTasks: Task[];
  currentUserId: string;
  currentUserEmail: string;
  currentUserName: string | null;
  canEdit: boolean;
}

type ColMap = Record<TaskStatus, Task[]>;

function group(tasks: Task[]): ColMap {
  const m: ColMap = { BACKLOG: [], TODO: [], IN_PROGRESS: [], REVIEW: [], DONE: [] };
  for (const t of tasks) m[t.status]?.push(t);
  return m;
}

export default function KanbanBoard({
  project,
  initialTasks,
  currentUserId,
  currentUserEmail,
  currentUserName,
  canEdit,
}: Props) {
  const [columns, setColumns] = useState<ColMap>(group(initialTasks));
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [creatingIn, setCreatingIn] = useState<TaskStatus | null>(null);

  const handleDragEnd = useCallback(async (result: DropResult) => {
    if (!canEdit) return;
    const { source, destination, draggableId } = result;
    if (!destination) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;

    const src = source.droppableId as TaskStatus;
    const dst = destination.droppableId as TaskStatus;

    const next = { ...columns };
    const srcList = [...next[src]];
    const [moved] = srcList.splice(source.index, 1);
    const updated = { ...moved, status: dst };

    if (src === dst) {
      srcList.splice(destination.index, 0, updated);
      next[src] = srcList;
    } else {
      const dstList = [...next[dst]];
      dstList.splice(destination.index, 0, updated);
      next[src] = srcList;
      next[dst] = dstList;
    }
    setColumns(next);

    const list = next[dst];
    const idx = list.findIndex(t => t.id === draggableId);
    const prev = list[idx - 1]?.position ?? null;
    const nxt = list[idx + 1]?.position ?? null;

    try {
      const res = await fetch(`/api/tasks/${draggableId}/move`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: dst, prevPosition: prev, nextPosition: nxt }),
      });
      if (res.ok) {
        const serverTask = await res.json();
        setColumns(c => ({ ...c, [dst]: c[dst].map(t => t.id === serverTask.id ? serverTask : t) }));
      }
    } catch { setColumns(group(initialTasks)); }
  }, [canEdit, columns, initialTasks]);

  const handleCreated = (task: Task) => {
    setColumns(c => ({ ...c, [task.status]: [...c[task.status], task] }));
    setCreatingIn(null);
  };

  const handleUpdated = (task: Task) => {
    setColumns(c => {
      const n = { ...c };
      for (const s of Object.keys(n) as TaskStatus[]) n[s] = n[s].filter(t => t.id !== task.id);
      n[task.status] = [...n[task.status], task];
      return n;
    });
    setSelectedTask(task);
  };

  const handleDeleted = (id: string) => {
    setColumns(c => {
      const n = { ...c };
      for (const s of Object.keys(n) as TaskStatus[]) n[s] = n[s].filter(t => t.id !== id);
      return n;
    });
    setSelectedTask(null);
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Board header */}
      <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--vsc-border)',
                    display: 'flex', alignItems: 'center', background: 'var(--vsc-bg)', flexShrink: 0 }}>
        <span style={{ width: 12, height: 12, borderRadius: '50%', background: project.color,
                       display: 'inline-block', marginRight: 10 }} />
        <span style={{ color: 'var(--vsc-text)', fontWeight: 600, fontSize: 14 }}>{project.name}</span>
        <span style={{ color: 'var(--vsc-muted)', fontSize: 12, marginLeft: 10 }}>
          — {Object.values(columns).flat().length} tasks
        </span>
      </div>

      {/* Board */}
      <DragDropContext onDragEnd={handleDragEnd}>
        <div style={{ display: 'flex', gap: 12, padding: 16, overflowX: 'auto',
                      overflowY: 'hidden', height: '100%', alignItems: 'flex-start' }}>
          {COLUMNS.map(col => {
            const style = COLUMN_STYLES[col.id];
            const tasks = columns[col.id];
            return (
              <div key={col.id} style={{
                width: 272, minWidth: 272, display: 'flex', flexDirection: 'column',
                maxHeight: '100%', background: 'var(--vsc-sidebar)',
                border: '1px solid var(--vsc-border)', borderRadius: 4, overflow: 'hidden',
              }}>
                {/* Column header */}
                <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--vsc-border)',
                              display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%',
                                   background: style.accent, display: 'inline-block' }} />
                    <span style={{ color: 'var(--vsc-text)', fontSize: 12, fontWeight: 600 }}>{col.label}</span>
                    <span style={{ background: 'var(--vsc-hover)', color: 'var(--vsc-muted)',
                                   fontSize: 11, padding: '1px 6px', borderRadius: 10 }}>
                      {tasks.length}
                    </span>
                  </div>
                  {canEdit && (
                    <button className="vsc-btn vsc-btn-ghost" style={{ padding: '2px 4px' }}
                      onClick={() => setCreatingIn(col.id)} title="Add task">
                      <Plus size={13} />
                    </button>
                  )}
                </div>

                <Droppable droppableId={col.id}>
                  {(provided, snap) => (
                    <div ref={provided.innerRef} {...provided.droppableProps}
                      style={{ flex: 1, overflowY: 'auto', padding: 8, minHeight: 60,
                               background: snap.isDraggingOver ? `${style.accent}15` : 'transparent',
                               transition: 'background 0.15s' }}>
                      {tasks.map((task, idx) => (
                        <Draggable key={task.id} draggableId={task.id} index={idx} isDragDisabled={!canEdit}>
                          {(prov, snapDrag) => (
                            <div ref={prov.innerRef} {...prov.draggableProps} {...prov.dragHandleProps}
                              style={{ ...prov.draggableProps.style, marginBottom: 8 }}>
                              <TaskCard task={task} status={col.id}
                                isDragging={snapDrag.isDragging}
                                onClick={() => setSelectedTask(task)} />
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </div>
            );
          })}
        </div>
      </DragDropContext>

      {(selectedTask || creatingIn) && (
        <TaskModal
          task={selectedTask}
          defaultStatus={creatingIn ?? undefined}
          projectId={project.id}
          currentUserId={currentUserId}
          currentUserEmail={currentUserEmail}
          currentUserName={currentUserName}
          readOnly={!canEdit}
          availableTasks={Object.values(columns).flat()}
          onCreated={handleCreated}
          onUpdated={handleUpdated}
          onDeleted={handleDeleted}
          onClose={() => { setSelectedTask(null); setCreatingIn(null); }}
        />
      )}
    </div>
  );
}
