import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { requireProjectAccess } from '@/lib/project-access';

const createSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().max(5000).optional().nullable(),
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
    orderBy: { position: 'asc' },
    include: {
      assignee: { select: { id: true, email: true, name: true } },
      attachments: true,
    },
  });
  return NextResponse.json(tasks);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });

  const { projectId, dueDate, ...rest } = parsed.data;
  const access = await requireProjectAccess(projectId, session.user.id, 'READ_WRITE');
  if (!access) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

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
      dueDate: dueDate ? new Date(dueDate) : null,
      position: (last?.position ?? 0) + 1000,
      projectId,
      creatorId: session.user.id,
    },
    include: {
      assignee: { select: { id: true, email: true, name: true } },
      attachments: true,
    },
  });
  return NextResponse.json(task, { status: 201 });
}
