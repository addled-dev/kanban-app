export type TaskStatus = 'BACKLOG' | 'TODO' | 'IN_PROGRESS' | 'REVIEW' | 'DONE';
export type Priority = 'LOW' | 'MEDIUM' | 'HIGH';
export type ProjectRole = 'ADMIN' | 'READ_WRITE' | 'VIEW';

export interface User {
  id: string;
  email: string;
  name: string | null;
}

export interface Project {
  id: string;
  name: string;
  description: string | null;
  color: string;
  ownerId: string;
  membershipRole: ProjectRole;
  createdAt: string;
  updatedAt: string;
  _count?: { tasks: number };
}

export interface ProjectMember {
  id: string;
  role: ProjectRole;
  createdAt: string;
  updatedAt: string;
  userId: string;
  user: User;
}

export interface ProjectInvite {
  id: string;
  email: string;
  name: string | null;
  projectId: string;
  projectRole: ProjectRole;
  expiresAt: string;
  usedAt: string | null;
  createdAt: string;
}

export interface Attachment {
  id: string;
  taskId: string;
  filename: string;
  url: string;
  size: number;
  mimeType: string | null;
  createdAt: string;
}

export interface Task {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: Priority | null;
  dueDate: string | null;
  position: number;
  labels: string[];
  projectId: string;
  creatorId: string;
  assigneeId: string | null;
  assignee: User | null;
  attachments: Attachment[];
  createdAt: string;
  updatedAt: string;
}

export interface McpApiKey {
  id: string;
  name: string;
  lastUsed: string | null;
  createdAt: string;
}

export const COLUMNS: { id: TaskStatus; label: string }[] = [
  { id: 'BACKLOG', label: 'Backlog' },
  { id: 'TODO', label: 'To Do' },
  { id: 'IN_PROGRESS', label: 'In Progress' },
  { id: 'REVIEW', label: 'Review' },
  { id: 'DONE', label: 'Done' },
];

export const COLUMN_STYLES: Record<
  TaskStatus,
  { lightBg: string; darkBg: string; accent: string; darkAccent: string; border: string }
> = {
  BACKLOG:     { lightBg: '#f3e8ff', darkBg: '#2e1a47', accent: '#7c3aed', darkAccent: '#a78bfa', border: '#c084fc' },
  TODO:        { lightBg: '#fefce8', darkBg: '#2d2a07', accent: '#a16207', darkAccent: '#fde047', border: '#facc15' },
  IN_PROGRESS: { lightBg: '#eff6ff', darkBg: '#172554', accent: '#1d4ed8', darkAccent: '#60a5fa', border: '#3b82f6' },
  REVIEW:      { lightBg: '#fff7ed', darkBg: '#2c1503', accent: '#c2410c', darkAccent: '#fb923c', border: '#f97316' },
  DONE:        { lightBg: '#f0fdf4', darkBg: '#052e16', accent: '#15803d', darkAccent: '#4ade80', border: '#22c55e' },
};

export const PRIORITY_CONFIG: Record<Priority, { label: string; color: string; darkColor: string }> = {
  LOW:    { label: 'Low',    color: '#16a34a', darkColor: '#4ade80' },
  MEDIUM: { label: 'Medium', color: '#ca8a04', darkColor: '#fde047' },
  HIGH:   { label: 'High',   color: '#dc2626', darkColor: '#f87171' },
};

export const PROJECT_COLORS = [
  '#007ACC','#4EC9B0','#CE9178','#608B4E','#DCDCAA',
  '#C586C0','#9CDCFE','#F44747','#569CD6','#D7BA7D',
];
