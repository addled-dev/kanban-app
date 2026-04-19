import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { formatProjectForUser } from '@/lib/project-access';

const createSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional().nullable(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default('#007ACC'),
});

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const projects = await prisma.project.findMany({
    where: {
      memberships: { some: { userId: session.user.id } },
    },
    orderBy: { updatedAt: 'desc' },
    include: {
      _count: { select: { tasks: true } },
      memberships: {
        where: { userId: session.user.id },
        select: { role: true },
      },
    },
  });
  return NextResponse.json(projects.map(formatProjectForUser));
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });

  const project = await prisma.$transaction(async (tx) => {
    const created = await tx.project.create({
      data: { ...parsed.data, ownerId: session.user.id },
    });

    await tx.projectMember.create({
      data: {
        projectId: created.id,
        userId: session.user.id,
        role: 'ADMIN',
      },
    });

    return tx.project.findUniqueOrThrow({
      where: { id: created.id },
      include: {
        _count: { select: { tasks: true } },
        memberships: {
          where: { userId: session.user.id },
          select: { role: true },
        },
      },
    });
  });

  return NextResponse.json(formatProjectForUser(project), { status: 201 });
}
