import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { requireProjectAccess } from '@/lib/project-access';

const updateRoleSchema = z.object({
  role: z.enum(['ADMIN', 'READ_WRITE', 'VIEW']),
});

async function countOtherAdmins(projectId: string, excludedUserId: string) {
  return prisma.projectMember.count({
    where: {
      projectId,
      role: 'ADMIN',
      userId: { not: excludedUserId },
    },
  });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string; userId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const access = await requireProjectAccess(params.id, session.user.id, 'ADMIN');
  if (!access) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const parsed = updateRoleSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  }

  const member = await prisma.projectMember.findUnique({
    where: {
      projectId_userId: {
        projectId: params.id,
        userId: params.userId,
      },
    },
    include: {
      user: { select: { id: true, email: true, name: true } },
    },
  });

  if (!member) return NextResponse.json({ error: 'Member not found' }, { status: 404 });

  if (member.userId === access.project.ownerId && parsed.data.role !== 'ADMIN') {
    return NextResponse.json({ error: 'The project creator must remain an admin' }, { status: 400 });
  }

  if (member.role === 'ADMIN' && parsed.data.role !== 'ADMIN') {
    const otherAdmins = await countOtherAdmins(params.id, member.userId);
    if (otherAdmins === 0) {
      return NextResponse.json({ error: 'A project must have at least one admin' }, { status: 400 });
    }
  }

  const updated = await prisma.projectMember.update({
    where: {
      projectId_userId: {
        projectId: params.id,
        userId: params.userId,
      },
    },
    data: { role: parsed.data.role },
    include: {
      user: { select: { id: true, email: true, name: true } },
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string; userId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const access = await requireProjectAccess(params.id, session.user.id, 'ADMIN');
  if (!access) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const member = await prisma.projectMember.findUnique({
    where: {
      projectId_userId: {
        projectId: params.id,
        userId: params.userId,
      },
    },
  });

  if (!member) return NextResponse.json({ error: 'Member not found' }, { status: 404 });

  if (member.userId === access.project.ownerId) {
    return NextResponse.json({ error: 'The project creator cannot be removed' }, { status: 400 });
  }

  if (member.role === 'ADMIN') {
    const otherAdmins = await countOtherAdmins(params.id, member.userId);
    if (otherAdmins === 0) {
      return NextResponse.json({ error: 'A project must have at least one admin' }, { status: 400 });
    }
  }

  await prisma.projectMember.delete({
    where: {
      projectId_userId: {
        projectId: params.id,
        userId: params.userId,
      },
    },
  });

  return NextResponse.json({ success: true });
}
