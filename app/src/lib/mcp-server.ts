import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { prisma } from './prisma';
import { canWriteProject, formatProjectForUser, requireProjectAccess, requireTaskAccess } from './project-access';
import { requiredParentType } from './work-items';

const STATUS_VALUES = ['BACKLOG', 'TODO', 'IN_PROGRESS', 'REVIEW', 'DONE'] as const;
const PRIORITY_VALUES = ['LOW', 'MEDIUM', 'HIGH'] as const;
const WORK_ITEM_TYPES = ['EPIC', 'FEATURE', 'STORY', 'TASK'] as const;

async function createWorkItemForUser(input: {
  userId: string;
  projectId: string;
  title: string;
  description?: string;
  status?: (typeof STATUS_VALUES)[number];
  priority?: (typeof PRIORITY_VALUES)[number];
  dueDate?: string;
  labels?: string[];
  parentId?: string;
  type: (typeof WORK_ITEM_TYPES)[number];
}) {
  const access = await requireProjectAccess(input.projectId, input.userId, 'READ_WRITE');
  if (!access || !canWriteProject(access.role)) {
    throw new Error(`project ${input.projectId} not found or you do not have write access`);
  }

  const neededParentType = requiredParentType(input.type);
  const normalizedParentId = input.parentId ?? null;
  if (neededParentType && !normalizedParentId) {
    throw new Error(`${input.type} requires a parent ${neededParentType.toLowerCase()}`);
  }
  if (!neededParentType && normalizedParentId) {
    throw new Error(`${input.type} cannot have a parent`);
  }

  if (normalizedParentId) {
    const parent = await prisma.task.findFirst({
      where: { id: normalizedParentId, projectId: input.projectId },
      select: { id: true, type: true },
    });
    if (!parent) {
      throw new Error('parent item not found in this project');
    }
    if (parent.type !== neededParentType) {
      throw new Error(`${input.type} parent must be of type ${neededParentType}`);
    }
  }

  const col = input.status ?? 'BACKLOG';
  const last = await prisma.task.findFirst({
    where: { projectId: input.projectId, status: col },
    orderBy: { position: 'desc' },
  });

  return prisma.task.create({
    data: {
      title: input.title,
      description: input.description,
      status: col,
      type: input.type,
      parentId: normalizedParentId,
      priority: input.priority,
      dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
      labels: input.labels ?? [],
      position: (last?.position ?? 0) + 1000,
      projectId: input.projectId,
      creatorId: input.userId,
    },
    include: {
      assignee: { select: { id: true, email: true, name: true } },
      attachments: true,
      children: { select: { id: true } },
    },
  });
}

export function buildMcpServer(userId: string): McpServer {
  const server = new McpServer({
    name: 'kanban-mcp',
    version: '1.0.0',
  });

  // ── list_projects ──────────────────────────────────────────────
  server.tool(
    'list_projects',
    'List all of your kanban projects.',
    {},
    async () => {
      const projects = await prisma.project.findMany({
        where: {
          memberships: { some: { userId } },
        },
        orderBy: { updatedAt: 'desc' },
        include: {
          _count: { select: { tasks: true } },
          memberships: {
            where: { userId },
            select: { role: true },
          },
        },
      });
      return { content: [{ type: 'text', text: JSON.stringify(projects.map(formatProjectForUser), null, 2) }] };
    }
  );

  // ── create_project ─────────────────────────────────────────────
  server.tool(
    'create_project',
    'Create a new kanban project.',
    {
      name: z.string().min(1).max(120).describe('Project name'),
      description: z.string().max(500).optional().describe('Optional description'),
      color: z
        .string()
        .regex(/^#[0-9A-Fa-f]{6}$/)
        .optional()
        .describe('Hex colour, e.g. #007ACC'),
    },
    async ({ name, description, color }) => {
      const project = await prisma.$transaction(async (tx) => {
        const created = await tx.project.create({
          data: { name, description, color: color ?? '#007ACC', ownerId: userId },
        });

        await tx.projectMember.create({
          data: {
            projectId: created.id,
            userId,
            role: 'ADMIN',
          },
        });

        return tx.project.findUniqueOrThrow({
          where: { id: created.id },
          include: {
            _count: { select: { tasks: true } },
            memberships: {
              where: { userId },
              select: { role: true },
            },
          },
        });
      });
      return { content: [{ type: 'text', text: JSON.stringify(formatProjectForUser(project), null, 2) }] };
    }
  );

  // ── list_tasks ─────────────────────────────────────────────────
  server.tool(
    'list_tasks',
    'List tasks in one of your projects. Optionally filter by status column.',
    {
      projectId: z.string().describe('Project ID'),
      status: z
        .enum(STATUS_VALUES)
        .optional()
        .describe('Filter by column'),
    },
    async ({ projectId, status }) => {
      const access = await requireProjectAccess(projectId, userId, 'VIEW');
      if (!access) {
        return {
          content: [{ type: 'text', text: `Error: project ${projectId} not found or you do not have access` }],
          isError: true,
        };
      }
      const tasks = await prisma.task.findMany({
        where: { projectId, ...(status ? { status } : {}) },
        orderBy: [{ status: 'asc' }, { position: 'asc' }],
        include: {
          assignee: { select: { id: true, email: true, name: true } },
          attachments: { select: { id: true, filename: true, size: true } },
          children: { select: { id: true } },
        },
      });
      const byGroup = new Map<string, typeof tasks>();
      for (const task of tasks) {
        const key = `${task.status}:${task.parentId ?? 'root'}`;
        const group = byGroup.get(key);
        if (group) group.push(task);
        else byGroup.set(key, [task]);
      }

      const enriched = tasks.map((task) => {
        const siblings = byGroup.get(`${task.status}:${task.parentId ?? 'root'}`) ?? [];
        const idx = siblings.findIndex((s) => s.id === task.id);
        return {
          ...task,
          hierarchy: {
            parentId: task.parentId,
            childIds: task.children.map((child) => child.id),
            previousSiblingId: idx > 0 ? siblings[idx - 1].id : null,
            nextSiblingId: idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1].id : null,
          },
        };
      });

      return { content: [{ type: 'text', text: JSON.stringify(enriched, null, 2) }] };
    }
  );

  // ── create_task ────────────────────────────────────────────────
  server.tool(
    'create_task',
    'Create a work item in one of your projects. Type defaults to TASK.',
    {
      projectId: z.string().describe('Project ID'),
      title: z.string().min(1).max(255).describe('Task title'),
      description: z.string().max(5000).optional(),
      type: z.enum(WORK_ITEM_TYPES).optional().describe('Work item type (default: TASK)'),
      parentId: z.string().optional().describe('Parent ID (required for FEATURE/STORY/TASK)'),
      status: z
        .enum(STATUS_VALUES)
        .optional()
        .describe('Initial column (default: BACKLOG)'),
      priority: z.enum(PRIORITY_VALUES).optional(),
      dueDate: z.string().optional().describe('ISO 8601 date string'),
      labels: z.array(z.string()).optional(),
    },
    async ({ projectId, title, description, type, parentId, status, priority, dueDate, labels }) => {
      try {
        const task = await createWorkItemForUser({
          userId,
          projectId,
          title,
          description,
          type: type ?? 'TASK',
          parentId,
          status,
          priority,
          dueDate,
          labels,
        });
        return { content: [{ type: 'text', text: JSON.stringify(task, null, 2) }] };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error: ${(error as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    'create_epic',
    'Create an epic in one of your projects.',
    {
      projectId: z.string().describe('Project ID'),
      title: z.string().min(1).max(255).describe('Epic title'),
      description: z.string().max(5000).optional(),
      status: z.enum(STATUS_VALUES).optional(),
      priority: z.enum(PRIORITY_VALUES).optional(),
      dueDate: z.string().optional().describe('ISO 8601 date string'),
      labels: z.array(z.string()).optional(),
    },
    async ({ projectId, title, description, status, priority, dueDate, labels }) => {
      try {
        const epic = await createWorkItemForUser({
          userId,
          projectId,
          title,
          description,
          type: 'EPIC',
          status,
          priority,
          dueDate,
          labels,
        });
        return { content: [{ type: 'text', text: JSON.stringify(epic, null, 2) }] };
      } catch (error) {
        return { content: [{ type: 'text', text: `Error: ${(error as Error).message}` }], isError: true };
      }
    }
  );

  server.tool(
    'create_feature',
    'Create a feature under an epic.',
    {
      projectId: z.string().describe('Project ID'),
      parentId: z.string().describe('Parent epic ID'),
      title: z.string().min(1).max(255).describe('Feature title'),
      description: z.string().max(5000).optional(),
      status: z.enum(STATUS_VALUES).optional(),
      priority: z.enum(PRIORITY_VALUES).optional(),
      dueDate: z.string().optional().describe('ISO 8601 date string'),
      labels: z.array(z.string()).optional(),
    },
    async ({ projectId, parentId, title, description, status, priority, dueDate, labels }) => {
      try {
        const feature = await createWorkItemForUser({
          userId,
          projectId,
          title,
          description,
          type: 'FEATURE',
          parentId,
          status,
          priority,
          dueDate,
          labels,
        });
        return { content: [{ type: 'text', text: JSON.stringify(feature, null, 2) }] };
      } catch (error) {
        return { content: [{ type: 'text', text: `Error: ${(error as Error).message}` }], isError: true };
      }
    }
  );

  server.tool(
    'create_story',
    'Create a story under a feature.',
    {
      projectId: z.string().describe('Project ID'),
      parentId: z.string().describe('Parent feature ID'),
      title: z.string().min(1).max(255).describe('Story title'),
      description: z.string().max(5000).optional(),
      status: z.enum(STATUS_VALUES).optional(),
      priority: z.enum(PRIORITY_VALUES).optional(),
      dueDate: z.string().optional().describe('ISO 8601 date string'),
      labels: z.array(z.string()).optional(),
    },
    async ({ projectId, parentId, title, description, status, priority, dueDate, labels }) => {
      try {
        const story = await createWorkItemForUser({
          userId,
          projectId,
          title,
          description,
          type: 'STORY',
          parentId,
          status,
          priority,
          dueDate,
          labels,
        });
        return { content: [{ type: 'text', text: JSON.stringify(story, null, 2) }] };
      } catch (error) {
        return { content: [{ type: 'text', text: `Error: ${(error as Error).message}` }], isError: true };
      }
    }
  );

  // ── move_task ──────────────────────────────────────────────────
  server.tool(
    'move_task',
    'Move a task to a different status column.',
    {
      taskId: z.string().describe('Task ID'),
      status: z.enum(STATUS_VALUES).describe('Target column'),
    },
    async ({ taskId, status }) => {
      const access = await requireTaskAccess(taskId, userId, 'READ_WRITE');
      if (!access || !canWriteProject(access.role)) {
        return {
          content: [{ type: 'text', text: `Error: task ${taskId} not found or you do not have write access` }],
          isError: true,
        };
      }
      const task = access.task;
      const last = await prisma.task.findFirst({
        where: { projectId: task.projectId, status },
        orderBy: { position: 'desc' },
      });
      const updated = await prisma.task.update({
        where: { id: taskId },
        data: { status, position: (last?.position ?? 0) + 1000 },
        include: {
          assignee: { select: { id: true, email: true, name: true } },
          attachments: { select: { id: true, filename: true, size: true } },
        },
      });
      return { content: [{ type: 'text', text: JSON.stringify(updated, null, 2) }] };
    }
  );

  // ── delete_task ────────────────────────────────────────────────
  server.tool(
    'delete_task',
    'Permanently delete one of your tasks.',
    {
      taskId: z.string().describe('Task ID'),
    },
    async ({ taskId }) => {
      const access = await requireTaskAccess(taskId, userId, 'READ_WRITE');
      if (!access || !canWriteProject(access.role)) {
        return {
          content: [{ type: 'text', text: `Error: task ${taskId} not found or you do not have write access` }],
          isError: true,
        };
      }
      const task = access.task;
      await prisma.task.delete({ where: { id: taskId } });
      return {
        content: [{ type: 'text', text: `Task "${task.title}" (${taskId}) deleted.` }],
      };
    }
  );

  return server;
}
