import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { requireProjectAccess } from '@/lib/project-access';
import { requiredParentType } from '@/lib/work-items';

const createSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().max(5000).optional().nullable(),
  type: z.enum(['EPIC', 'FEATURE', 'STORY', 'TASK']).default('TASK'),
  parentId: z.string().optional().nullable(),
  status: z.enum(['BACKLOG','TODO','IN_PROGRESS','REVIEW','DONE']).default('BACKLOG'),
  priority: z.enum(['LOW','MEDIUM','HIGH']).optional().nullable(),
  dueDate: z.string().datetime({ offset: true }).optional().nullable(),
  labels: z.array(z.string().max(50)).max(10).default([]),
  assigneeId: z.string().optional().nullable(),
  projectId: z.string(),
});

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId');
  const status = searchParams.get('status');
  if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 });

  const access = await requireProjectAccess(projectId, session.user.id, 'VIEW');
  if (!access) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const tasks = await prisma.task.findMany({
    where: { projectId, ...(status ? { status: status as any } : {}) },
    orderBy: [{ status: 'asc' }, { position: 'asc' }],
    include: {
      assignee: { select: { id: true, email: true, name: true } },
      attachments: true,
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
      childIds: task.children.map((child) => child.id),
      previousSiblingId: idx > 0 ? siblings[idx - 1].id : null,
      nextSiblingId: idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1].id : null,
    };
  });

  return NextResponse.json(enriched);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });

  const { projectId, dueDate, type, parentId, ...rest } = parsed.data;
  const access = await requireProjectAccess(projectId, session.user.id, 'READ_WRITE');
  if (!access) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  let normalizedParentId: string | null = parentId ?? null;
  const neededParentType = requiredParentType(type);

  if (neededParentType && !normalizedParentId) {
    return NextResponse.json(
      { error: `${type} requires a parent ${neededParentType.toLowerCase()}` },
      { status: 400 }
    );
  }
  if (!neededParentType) {
    normalizedParentId = null;
  }

  if (normalizedParentId) {
    const parent = await prisma.task.findFirst({
      where: { id: normalizedParentId, projectId },
      select: { id: true, type: true },
    });
    if (!parent) {
      return NextResponse.json({ error: 'Parent item not found in this project' }, { status: 400 });
    }
    if (parent.type !== neededParentType) {
      return NextResponse.json(
        { error: `${type} parent must be of type ${neededParentType}` },
        { status: 400 }
      );
    }
  }

  if (rest.assigneeId) {
    const assigneeMembership = await prisma.projectMember.findUnique({
      where: {
        projectId_userId: {
          projectId,
          userId: rest.assigneeId,
        },
      },
    });
    if (!assigneeMembership) {
      return NextResponse.json({ error: 'Assignee must be a project member' }, { status: 400 });
    }
  }

  const last = await prisma.task.findFirst({
    where: { projectId, status: rest.status },
    orderBy: { position: 'desc' },
  });

  const task = await prisma.task.create({
    data: {
      ...rest,
      type,
      parentId: normalizedParentId,
      dueDate: dueDate ? new Date(dueDate) : null,
      position: (last?.position ?? 0) + 1000,
      projectId,
      creatorId: session.user.id,
    },
    include: {
      assignee: { select: { id: true, email: true, name: true } },
      attachments: true,
      children: { select: { id: true } },
    },
  });

  return NextResponse.json({
    ...task,
    childIds: task.children.map((child) => child.id),
    previousSiblingId: null,
    nextSiblingId: null,
  }, { status: 201 });
}
