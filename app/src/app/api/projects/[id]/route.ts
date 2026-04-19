import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { formatProjectForUser, requireProjectAccess } from '@/lib/project-access';

const updateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(500).optional().nullable(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const access = await requireProjectAccess(params.id, session.user.id, 'ADMIN');
  if (!access) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const parsed = updateSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  const updated = await prisma.project.update({
    where: { id: params.id }, data: parsed.data,
    include: {
      _count: { select: { tasks: true } },
      memberships: {
        where: { userId: session.user.id },
        select: { role: true },
      },
    },
  });
  return NextResponse.json(formatProjectForUser(updated));
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const access = await requireProjectAccess(params.id, session.user.id, 'ADMIN');
  if (!access) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  await prisma.project.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true });
}
