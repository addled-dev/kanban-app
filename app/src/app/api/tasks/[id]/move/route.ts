import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { requireTaskAccess } from '@/lib/project-access';

const moveSchema = z.object({
  status: z.enum(['BACKLOG','TODO','IN_PROGRESS','REVIEW','DONE']),
  prevPosition: z.number().optional().nullable(),
  nextPosition: z.number().optional().nullable(),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const access = await requireTaskAccess(params.id, session.user.id, 'READ_WRITE');
  if (!access) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const task = access.task;

  const parsed = moveSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });

  const { status, prevPosition, nextPosition } = parsed.data;

  let position: number;
  if (prevPosition != null && nextPosition != null) {
    position = (prevPosition + nextPosition) / 2;
  } else if (prevPosition != null) {
    position = prevPosition + 1000;
  } else if (nextPosition != null) {
    position = nextPosition / 2;
  } else {
    const last = await prisma.task.findFirst({
      where: { projectId: task.projectId, status },
      orderBy: { position: 'desc' },
    });
    position = (last?.position ?? 0) + 1000;
  }

  const updated = await prisma.task.update({
    where: { id: params.id },
    data: { status, position },
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
