import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { requireTaskAccess } from '@/lib/project-access';
import { requiredParentType } from '@/lib/work-items';

const updateSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().max(5000).optional().nullable(),
  type: z.enum(['EPIC', 'FEATURE', 'STORY', 'TASK']).optional(),
  parentId: z.string().optional().nullable(),
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

  const { dueDate, type, parentId, ...rest } = parsed.data;
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

  const nextType = type ?? access.task.type;
  const neededParentType = requiredParentType(nextType);
  const explicitParentSent = Object.prototype.hasOwnProperty.call(parsed.data, 'parentId');
  const nextParentId = explicitParentSent ? (parentId ?? null) : access.task.parentId;

  if (!neededParentType && nextParentId) {
    return NextResponse.json({ error: 'Epic cannot have a parent item' }, { status: 400 });
  }
  if (neededParentType && !nextParentId) {
    return NextResponse.json(
      { error: `${nextType} requires a parent ${neededParentType.toLowerCase()}` },
      { status: 400 }
    );
  }

  if (nextParentId) {
    if (nextParentId === params.id) {
      return NextResponse.json({ error: 'Item cannot be its own parent' }, { status: 400 });
    }

    const parent = await prisma.task.findFirst({
      where: { id: nextParentId, projectId: access.task.project.id },
      select: { id: true, type: true },
    });
    if (!parent) {
      return NextResponse.json({ error: 'Parent item not found in this project' }, { status: 400 });
    }
    if (parent.type !== neededParentType) {
      return NextResponse.json(
        { error: `${nextType} parent must be of type ${neededParentType}` },
        { status: 400 }
      );
    }
  }

  if (type) {
    const childCount = await prisma.task.count({
      where: {
        parentId: params.id,
        projectId: access.task.project.id,
      },
    });
    if (type === 'TASK' && childCount > 0) {
      return NextResponse.json({ error: 'Task items cannot have children' }, { status: 400 });
    }
  }

  const updated = await prisma.task.update({
    where: { id: params.id },
    data: {
      ...rest,
      ...(type ? { type } : {}),
      ...(explicitParentSent ? { parentId: parentId ?? null } : {}),
      ...(dueDate !== undefined ? { dueDate: dueDate ? new Date(dueDate) : null } : {}),
    },
    include: {
      assignee: { select: { id: true, email: true, name: true } },
      attachments: true,
      children: { select: { id: true } },
    },
  });

  return NextResponse.json({
    ...updated,
    childIds: updated.children.map((child) => child.id),
    previousSiblingId: null,
    nextSiblingId: null,
  });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const access = await requireTaskAccess(params.id, session.user.id, 'READ_WRITE');
  if (!access) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  await prisma.task.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true });
}
