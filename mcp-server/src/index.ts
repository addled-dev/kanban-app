import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';

const prisma = new PrismaClient();
const PORT = parseInt(process.env.PORT ?? '3001', 10);
const API_KEY = process.env.MCP_API_KEY ?? 'mcp_secret_key_change_me';
const OAUTH_ISSUER = process.env.MCP_OAUTH_ISSUER;
const OAUTH_AUDIENCE = process.env.MCP_OAUTH_AUDIENCE;
const OAUTH_JWKS_URL = process.env.MCP_OAUTH_JWKS_URL;

const STATUS_VALUES = ['BACKLOG', 'TODO', 'IN_PROGRESS', 'REVIEW', 'DONE'] as const;
const PRIORITY_VALUES = ['LOW', 'MEDIUM', 'HIGH'] as const;
const WORK_ITEM_TYPES = ['EPIC', 'FEATURE', 'STORY', 'TASK'] as const;
const PARENT_TYPE_BY_CHILD: Record<(typeof WORK_ITEM_TYPES)[number], (typeof WORK_ITEM_TYPES)[number] | null> = {
  EPIC: null,
  FEATURE: 'EPIC',
  STORY: 'FEATURE',
  TASK: 'STORY',
};

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function requiredParentType(type: (typeof WORK_ITEM_TYPES)[number]) {
  return PARENT_TYPE_BY_CHILD[type];
}

function getJwks() {
  if (!OAUTH_JWKS_URL) return null;
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(OAUTH_JWKS_URL));
  }
  return jwks;
}

async function verifyBearerToken(token: string): Promise<JWTPayload | null> {
  const keyset = getJwks();
  if (!keyset || !OAUTH_ISSUER) {
    return null;
  }
  const result = await jwtVerify(token, keyset, {
    issuer: OAUTH_ISSUER,
    audience: OAUTH_AUDIENCE,
  });
  return result.payload;
}

async function createWorkItem(input: {
  projectId: string;
  creatorEmail: string;
  title: string;
  description?: string;
  type: (typeof WORK_ITEM_TYPES)[number];
  parentId?: string;
  status?: (typeof STATUS_VALUES)[number];
  priority?: (typeof PRIORITY_VALUES)[number];
  dueDate?: string;
  labels?: string[];
  assigneeEmail?: string;
}) {
  const project = await prisma.project.findUnique({ where: { id: input.projectId } });
  if (!project) {
    throw new Error(`Project ${input.projectId} not found`);
  }

  const creator = await prisma.user.findUnique({ where: { email: input.creatorEmail } });
  if (!creator) {
    throw new Error(`No user found with email ${input.creatorEmail}`);
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
      throw new Error('Parent item not found in this project');
    }
    if (parent.type !== neededParentType) {
      throw new Error(`${input.type} parent must be of type ${neededParentType}`);
    }
  }

  let assigneeId: string | undefined;
  if (input.assigneeEmail) {
    const assignee = await prisma.user.findUnique({ where: { email: input.assigneeEmail } });
    if (!assignee) {
      throw new Error(`No user found with assignee email ${input.assigneeEmail}`);
    }
    assigneeId = assignee.id;
  }

  const effectiveStatus = input.status ?? 'BACKLOG';
  const lastTask = await prisma.task.findFirst({
    where: { projectId: input.projectId, status: effectiveStatus },
    orderBy: { position: 'desc' },
  });
  const position = (lastTask?.position ?? 0) + 1000;

  return prisma.task.create({
    data: {
      title: input.title,
      description: input.description,
      type: input.type,
      parentId: normalizedParentId,
      status: effectiveStatus,
      priority: input.priority,
      dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
      labels: input.labels ?? [],
      position,
      projectId: input.projectId,
      creatorId: creator.id,
      assigneeId,
    },
    include: {
      assignee: { select: { id: true, email: true, name: true } },
      attachments: true,
      children: { select: { id: true } },
    },
  });
}

// ── Auth middleware ──────────────────────────────────────────────
async function requireMcpAuth(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  const key = req.headers['x-api-key'];
  if (key === API_KEY) {
    next();
    return;
  }

  const authHeader = req.headers.authorization;
  const bearerMatch = authHeader?.match(/^Bearer\s+(.+)$/i);
  if (!bearerMatch) {
    res
      .status(401)
      .setHeader('WWW-Authenticate', 'Bearer realm="kanban-mcp"')
      .json({ error: 'Provide X-Api-Key or Authorization: Bearer <token>' });
    return;
  }

  try {
    const payload = await verifyBearerToken(bearerMatch[1]);
    if (!payload) {
      res
        .status(401)
        .setHeader('WWW-Authenticate', 'Bearer realm="kanban-mcp", error="invalid_token"')
        .json({ error: 'OAuth bearer auth is not configured on this server' });
      return;
    }
    next();
  } catch {
    res
      .status(401)
      .setHeader('WWW-Authenticate', 'Bearer realm="kanban-mcp", error="invalid_token"')
      .json({ error: 'Invalid bearer token' });
    return;
  }
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
        .enum(STATUS_VALUES)
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

      return {
        content: [{ type: 'text', text: JSON.stringify(enriched, null, 2) }],
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
      type: z.enum(WORK_ITEM_TYPES).optional().default('TASK').describe('Work item type'),
      parentId: z.string().optional().describe('Parent ID (required for FEATURE/STORY/TASK)'),
      status: z
        .enum(STATUS_VALUES)
        .optional()
        .default('BACKLOG')
        .describe('Initial column for the task'),
      priority: z
        .enum(PRIORITY_VALUES)
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
      projectId, creatorEmail, title, description, type, parentId,
      status, priority, dueDate, labels, assigneeEmail,
    }) => {
      try {
        const task = await createWorkItem({
          projectId,
          creatorEmail,
          title,
          description,
          type,
          parentId,
          status,
          priority,
          dueDate,
          labels,
          assigneeEmail,
        });
        return {
          content: [{ type: 'text', text: JSON.stringify(task, null, 2) }],
        };
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
    'Create an epic in a project. The creator is identified by email.',
    {
      projectId: z.string().describe('ID of the project'),
      creatorEmail: z.string().email().describe('Email of the user creating the epic'),
      title: z.string().min(1).max(255).describe('Epic title'),
      description: z.string().max(5000).optional(),
      status: z.enum(STATUS_VALUES).optional().default('BACKLOG'),
      priority: z.enum(PRIORITY_VALUES).optional(),
      dueDate: z.string().optional().describe('Due date in ISO 8601 format'),
      labels: z.array(z.string().max(50)).max(10).optional().default([]),
      assigneeEmail: z.string().email().optional(),
    },
    async ({ projectId, creatorEmail, title, description, status, priority, dueDate, labels, assigneeEmail }) => {
      try {
        const epic = await createWorkItem({
          projectId,
          creatorEmail,
          title,
          description,
          type: 'EPIC',
          status,
          priority,
          dueDate,
          labels,
          assigneeEmail,
        });
        return { content: [{ type: 'text', text: JSON.stringify(epic, null, 2) }] };
      } catch (error) {
        return { content: [{ type: 'text', text: `Error: ${(error as Error).message}` }], isError: true };
      }
    }
  );

  server.tool(
    'create_feature',
    'Create a feature under an epic. The creator is identified by email.',
    {
      projectId: z.string().describe('ID of the project'),
      creatorEmail: z.string().email().describe('Email of the user creating the feature'),
      parentId: z.string().describe('Parent epic ID'),
      title: z.string().min(1).max(255).describe('Feature title'),
      description: z.string().max(5000).optional(),
      status: z.enum(STATUS_VALUES).optional().default('BACKLOG'),
      priority: z.enum(PRIORITY_VALUES).optional(),
      dueDate: z.string().optional().describe('Due date in ISO 8601 format'),
      labels: z.array(z.string().max(50)).max(10).optional().default([]),
      assigneeEmail: z.string().email().optional(),
    },
    async ({ projectId, creatorEmail, parentId, title, description, status, priority, dueDate, labels, assigneeEmail }) => {
      try {
        const feature = await createWorkItem({
          projectId,
          creatorEmail,
          title,
          description,
          type: 'FEATURE',
          parentId,
          status,
          priority,
          dueDate,
          labels,
          assigneeEmail,
        });
        return { content: [{ type: 'text', text: JSON.stringify(feature, null, 2) }] };
      } catch (error) {
        return { content: [{ type: 'text', text: `Error: ${(error as Error).message}` }], isError: true };
      }
    }
  );

  server.tool(
    'create_story',
    'Create a story under a feature. The creator is identified by email.',
    {
      projectId: z.string().describe('ID of the project'),
      creatorEmail: z.string().email().describe('Email of the user creating the story'),
      parentId: z.string().describe('Parent feature ID'),
      title: z.string().min(1).max(255).describe('Story title'),
      description: z.string().max(5000).optional(),
      status: z.enum(STATUS_VALUES).optional().default('BACKLOG'),
      priority: z.enum(PRIORITY_VALUES).optional(),
      dueDate: z.string().optional().describe('Due date in ISO 8601 format'),
      labels: z.array(z.string().max(50)).max(10).optional().default([]),
      assigneeEmail: z.string().email().optional(),
    },
    async ({ projectId, creatorEmail, parentId, title, description, status, priority, dueDate, labels, assigneeEmail }) => {
      try {
        const story = await createWorkItem({
          projectId,
          creatorEmail,
          title,
          description,
          type: 'STORY',
          parentId,
          status,
          priority,
          dueDate,
          labels,
          assigneeEmail,
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
    'Move a task to a different status column (progress it through the board).',
    {
      taskId: z.string().describe('ID of the task to move'),
      status: z
        .enum(STATUS_VALUES)
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
app.get('/sse', requireMcpAuth, async (req, res) => {
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

app.post('/messages', requireMcpAuth, async (req, res) => {
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
  console.log(`  Auth         : X-Api-Key or OAuth2 bearer token`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  await prisma.$disconnect();
  process.exit(0);
});
