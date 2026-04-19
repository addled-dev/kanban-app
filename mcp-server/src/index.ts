import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

const prisma = new PrismaClient();
const PORT = parseInt(process.env.PORT ?? '3001', 10);
const API_KEY = process.env.MCP_API_KEY ?? 'mcp_secret_key_change_me';

// ── Auth middleware ──────────────────────────────────────────────
function requireApiKey(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  const key = req.headers['x-api-key'];
  if (key !== API_KEY) {
    res.status(401).json({ error: 'Invalid or missing X-Api-Key header' });
    return;
  }
  next();
}

// ── Build MCP server ─────────────────────────────────────────────
function buildMcpServer(): McpServer {
  const server = new McpServer({
    name: 'kanban-mcp',
    version: '1.0.0',
  });

  // ── list_projects ──────────────────────────────────────────────
  server.tool(
    'list_projects',
    'List all kanban projects. Optionally filter by owner email.',
    {
      ownerEmail: z
        .string()
        .email()
        .optional()
        .describe('Filter projects by owner email address'),
    },
    async ({ ownerEmail }) => {
      const projects = await prisma.project.findMany({
        where: ownerEmail ? { owner: { email: ownerEmail } } : undefined,
        orderBy: { updatedAt: 'desc' },
        include: {
          owner: { select: { id: true, email: true, name: true } },
          _count: { select: { tasks: true } },
        },
      });
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(projects, null, 2),
          },
        ],
      };
    }
  );

  // ── create_project ─────────────────────────────────────────────
  server.tool(
    'create_project',
    'Create a new kanban project for a user identified by email.',
    {
      ownerEmail: z.string().email().describe('Email of the user who will own the project'),
      name: z.string().min(1).max(120).describe('Project name'),
      description: z.string().max(500).optional().describe('Optional project description'),
      color: z
        .string()
        .regex(/^#[0-9A-Fa-f]{6}$/)
        .optional()
        .default('#007ACC')
        .describe('Hex color for the project (e.g. #007ACC)'),
    },
    async ({ ownerEmail, name, description, color }) => {
      const owner = await prisma.user.findUnique({ where: { email: ownerEmail } });
      if (!owner) {
        return {
          content: [{ type: 'text', text: `Error: No user found with email ${ownerEmail}` }],
          isError: true,
        };
      }
      const project = await prisma.project.create({
        data: { name, description, color: color ?? '#007ACC', ownerId: owner.id },
        include: {
          owner: { select: { id: true, email: true, name: true } },
          _count: { select: { tasks: true } },
        },
      });
      return {
        content: [{ type: 'text', text: JSON.stringify(project, null, 2) }],
      };
    }
  );

  // ── list_tasks ─────────────────────────────────────────────────
  server.tool(
    'list_tasks',
    'List tasks in a project. Optionally filter by status column.',
    {
      projectId: z.string().describe('The project ID to list tasks from'),
      status: z
        .enum(['BACKLOG', 'TODO', 'IN_PROGRESS', 'REVIEW', 'DONE'])
        .optional()
        .describe('Filter by task status (column)'),
    },
    async ({ projectId, status }) => {
      const project = await prisma.project.findUnique({ where: { id: projectId } });
      if (!project) {
        return {
          content: [{ type: 'text', text: `Error: Project ${projectId} not found` }],
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
      return {
        content: [{ type: 'text', text: JSON.stringify(tasks, null, 2) }],
      };
    }
  );

  // ── create_task ────────────────────────────────────────────────
  server.tool(
    'create_task',
    'Create a new task in a project. The creator is identified by email.',
    {
      projectId: z.string().describe('ID of the project to add the task to'),
      creatorEmail: z.string().email().describe('Email of the user creating the task'),
      title: z.string().min(1).max(255).describe('Task title'),
      description: z.string().max(5000).optional().describe('Task description (markdown supported)'),
      status: z
        .enum(['BACKLOG', 'TODO', 'IN_PROGRESS', 'REVIEW', 'DONE'])
        .optional()
        .default('BACKLOG')
        .describe('Initial column for the task'),
      priority: z
        .enum(['LOW', 'MEDIUM', 'HIGH'])
        .optional()
        .describe('Task priority'),
      dueDate: z
        .string()
        .optional()
        .describe('Due date in ISO 8601 format (e.g. 2025-12-31T00:00:00Z)'),
      labels: z
        .array(z.string().max(50))
        .max(10)
        .optional()
        .default([])
        .describe('Array of label strings'),
      assigneeEmail: z
        .string()
        .email()
        .optional()
        .describe('Email of the user to assign the task to'),
    },
    async ({
      projectId, creatorEmail, title, description, status,
      priority, dueDate, labels, assigneeEmail,
    }) => {
      const project = await prisma.project.findUnique({ where: { id: projectId } });
      if (!project) {
        return {
          content: [{ type: 'text', text: `Error: Project ${projectId} not found` }],
          isError: true,
        };
      }

      const creator = await prisma.user.findUnique({ where: { email: creatorEmail } });
      if (!creator) {
        return {
          content: [{ type: 'text', text: `Error: No user found with email ${creatorEmail}` }],
          isError: true,
        };
      }

      let assigneeId: string | undefined;
      if (assigneeEmail) {
        const assignee = await prisma.user.findUnique({ where: { email: assigneeEmail } });
        if (!assignee) {
          return {
            content: [{ type: 'text', text: `Error: No user found with assignee email ${assigneeEmail}` }],
            isError: true,
          };
        }
        assigneeId = assignee.id;
      }

      const effectiveStatus = status ?? 'BACKLOG';
      const lastTask = await prisma.task.findFirst({
        where: { projectId, status: effectiveStatus },
        orderBy: { position: 'desc' },
      });
      const position = (lastTask?.position ?? 0) + 1000;

      const task = await prisma.task.create({
        data: {
          title,
          description,
          status: effectiveStatus,
          priority,
          dueDate: dueDate ? new Date(dueDate) : undefined,
          labels: labels ?? [],
          position,
          projectId,
          creatorId: creator.id,
          assigneeId,
        },
        include: {
          assignee: { select: { id: true, email: true, name: true } },
          attachments: true,
        },
      });

      return {
        content: [{ type: 'text', text: JSON.stringify(task, null, 2) }],
      };
    }
  );

  // ── move_task ──────────────────────────────────────────────────
  server.tool(
    'move_task',
    'Move a task to a different status column (progress it through the board).',
    {
      taskId: z.string().describe('ID of the task to move'),
      status: z
        .enum(['BACKLOG', 'TODO', 'IN_PROGRESS', 'REVIEW', 'DONE'])
        .describe('Target column to move the task to'),
    },
    async ({ taskId, status }) => {
      const task = await prisma.task.findUnique({ where: { id: taskId } });
      if (!task) {
        return {
          content: [{ type: 'text', text: `Error: Task ${taskId} not found` }],
          isError: true,
        };
      }

      const lastTask = await prisma.task.findFirst({
        where: { projectId: task.projectId, status },
        orderBy: { position: 'desc' },
      });
      const position = (lastTask?.position ?? 0) + 1000;

      const updated = await prisma.task.update({
        where: { id: taskId },
        data: { status, position },
        include: {
          assignee: { select: { id: true, email: true, name: true } },
          attachments: { select: { id: true, filename: true, size: true } },
        },
      });

      return {
        content: [{ type: 'text', text: JSON.stringify(updated, null, 2) }],
      };
    }
  );

  // ── delete_task ────────────────────────────────────────────────
  server.tool(
    'delete_task',
    'Permanently delete a task and all its attachments.',
    {
      taskId: z.string().describe('ID of the task to delete'),
    },
    async ({ taskId }) => {
      const task = await prisma.task.findUnique({ where: { id: taskId } });
      if (!task) {
        return {
          content: [{ type: 'text', text: `Error: Task ${taskId} not found` }],
          isError: true,
        };
      }
      await prisma.task.delete({ where: { id: taskId } });
      return {
        content: [
          { type: 'text', text: `Task ${taskId} ("${task.title}") deleted successfully.` },
        ],
      };
    }
  );

  return server;
}

// ── Express app ──────────────────────────────────────────────────
const app = express();
app.use(express.json());

// Health check (no auth required)
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', server: 'kanban-mcp', version: '1.0.0' });
});

// MCP over SSE — one transport per connection
app.get('/sse', requireApiKey, async (req, res) => {
  const server = buildMcpServer();
  const transport = new SSEServerTransport('/messages', res);
  await server.connect(transport);

  req.on('close', () => {
    transport.close().catch(() => {});
    server.close().catch(() => {});
  });
});

// Message endpoint for the SSE transport
const transports: Map<string, SSEServerTransport> = new Map();

app.post('/messages', requireApiKey, async (req, res) => {
  const sessionId = req.query.sessionId as string;
  const transport = transports.get(sessionId);
  if (!transport) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }
  await transport.handlePostMessage(req, res);
});

// ── Start ────────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Kanban MCP server running on port ${PORT}`);
  console.log(`  SSE endpoint : http://0.0.0.0:${PORT}/sse`);
  console.log(`  Health check : http://0.0.0.0:${PORT}/health`);
  console.log(`  Auth         : X-Api-Key header required`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  await prisma.$disconnect();
  process.exit(0);
});
