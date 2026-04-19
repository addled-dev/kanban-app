import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { prisma } from './prisma';
import { canWriteProject, formatProjectForUser, requireProjectAccess, requireTaskAccess } from './project-access';

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
        .enum(['BACKLOG', 'TODO', 'IN_PROGRESS', 'REVIEW', 'DONE'])
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
        },
      });
      return { content: [{ type: 'text', text: JSON.stringify(tasks, null, 2) }] };
    }
  );

  // ── create_task ────────────────────────────────────────────────
  server.tool(
    'create_task',
    'Create a task in one of your projects.',
    {
      projectId: z.string().describe('Project ID'),
      title: z.string().min(1).max(255).describe('Task title'),
      description: z.string().max(5000).optional(),
      status: z
        .enum(['BACKLOG', 'TODO', 'IN_PROGRESS', 'REVIEW', 'DONE'])
        .optional()
        .describe('Initial column (default: BACKLOG)'),
      priority: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional(),
      dueDate: z.string().optional().describe('ISO 8601 date string'),
      labels: z.array(z.string()).optional(),
    },
    async ({ projectId, title, description, status, priority, dueDate, labels }) => {
      const access = await requireProjectAccess(projectId, userId, 'READ_WRITE');
      if (!access || !canWriteProject(access.role)) {
        return {
          content: [{ type: 'text', text: `Error: project ${projectId} not found or you do not have write access` }],
          isError: true,
        };
      }
      const col = status ?? 'BACKLOG';
      const last = await prisma.task.findFirst({
        where: { projectId, status: col },
        orderBy: { position: 'desc' },
      });
      const task = await prisma.task.create({
        data: {
          title,
          description,
          status: col,
          priority,
          dueDate: dueDate ? new Date(dueDate) : undefined,
          labels: labels ?? [],
          position: (last?.position ?? 0) + 1000,
          projectId,
          creatorId: userId,
        },
        include: {
          assignee: { select: { id: true, email: true, name: true } },
          attachments: true,
        },
      });
      return { content: [{ type: 'text', text: JSON.stringify(task, null, 2) }] };
    }
  );

  // ── move_task ──────────────────────────────────────────────────
  server.tool(
    'move_task',
    'Move a task to a different status column.',
    {
      taskId: z.string().describe('Task ID'),
      status: z.enum(['BACKLOG', 'TODO', 'IN_PROGRESS', 'REVIEW', 'DONE']).describe('Target column'),
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
