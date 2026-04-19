import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { hash } from 'bcryptjs';
import { prisma } from '@/lib/prisma';

export async function GET(
  _req: NextRequest,
  { params }: { params: { token: string } }
) {
  const invite = await prisma.inviteToken.findUnique({
    where: { token: params.token },
    include: {
      project: {
        select: { id: true, name: true },
      },
    },
  });

  if (!invite) {
    return NextResponse.json({ error: 'Invalid invite link' }, { status: 404 });
  }
  if (invite.usedAt) {
    return NextResponse.json({ error: 'This invite has already been used' }, { status: 410 });
  }
  if (invite.expiresAt < new Date()) {
    return NextResponse.json({ error: 'This invite has expired' }, { status: 410 });
  }

  return NextResponse.json({
    email: invite.email,
    name: invite.name,
    projectName: invite.project?.name ?? null,
    projectRole: invite.projectRole ?? null,
  });
}

const schema = z.object({
  password: z.string().min(8).max(100),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  const invite = await prisma.inviteToken.findUnique({
    where: { token: params.token },
    include: {
      project: {
        select: { id: true },
      },
    },
  });

  if (!invite) return NextResponse.json({ error: 'Invalid invite link' }, { status: 404 });
  if (invite.usedAt) return NextResponse.json({ error: 'Invite already used' }, { status: 410 });
  if (invite.expiresAt < new Date()) {
    return NextResponse.json({ error: 'Invite has expired' }, { status: 410 });
  }

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  }

  // Check if email was taken in the meantime
  const existing = await prisma.user.findUnique({ where: { email: invite.email } });
  if (existing && !invite.projectId) {
    return NextResponse.json({ error: 'Email already registered' }, { status: 409 });
  }

  await prisma.$transaction(async (tx) => {
    const user = existing ?? await tx.user.create({
      data: {
        email: invite.email,
        name: invite.name,
        password: await hash(parsed.data.password, 12),
        role: 'USER',
        emailVerified: true,
      },
    });

    if (invite.projectId) {
      await tx.projectMember.upsert({
        where: {
          projectId_userId: {
            projectId: invite.projectId,
            userId: user.id,
          },
        },
        update: { role: invite.projectRole ?? 'READ_WRITE' },
        create: {
          projectId: invite.projectId,
          userId: user.id,
          role: invite.projectRole ?? 'READ_WRITE',
        },
      });
    }

    await tx.inviteToken.update({
      where: { token: params.token },
      data: { usedAt: new Date() },
    });
  });

  return NextResponse.json({ success: true });
}
