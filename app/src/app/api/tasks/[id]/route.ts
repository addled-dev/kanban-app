import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { requireTaskAccess } from '@/lib/project-access';

const updateSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().max(5000).optional().nullable(),
  priority: z.enum(['LOW','MEDIUM','HIGH']).optional().nullable(),
  dueDate: z.string().datetime({ offset: true }).optional().nullable(),
  labels: z.array(z.string().max(50)).max(10).optional(),
  assigneeId: z.string().optional().nullable(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const access = await requireTaskAccess(params.id, session.user.id, 'READ_WRITE');
  if (!access) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const parsed = updateSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });

  const { dueDate, ...rest } = parsed.data;
  if (rest.assigneeId) {
    const assigneeMembership = await prisma.projectMember.findUnique({
      where: {
        projectId_userId: {
          projectId: access.task.project.id,
          userId: rest.assigneeId,
        },
      },
    });
    if (!assigneeMembership) {
      return NextResponse.json({ error: 'Assignee must be a project member' }, { status: 400 });
    }
  }

  const updated = await prisma.task.update({
    where: { id: params.id },
    data: { ...rest, ...(dueDate !== undefined ? { dueDate: dueDate ? new Date(dueDate) : null } : {}) },
    include: { assignee: { select: { id: true, email: true, name: true } }, attachments: true },
  });
  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const access = await requireTaskAccess(params.id, session.user.id, 'READ_WRITE');
  if (!access) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  await prisma.task.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true });
}
