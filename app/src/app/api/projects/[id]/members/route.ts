import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { requireProjectAccess } from '@/lib/project-access';
import { expiresIn, generateToken } from '@/lib/tokens';
import { sendInviteEmail } from '@/lib/email';

const createMemberSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100).optional().nullable(),
  role: z.enum(['ADMIN', 'READ_WRITE', 'VIEW']).default('READ_WRITE'),
});

function serializeInvite(invite: {
  id: string;
  email: string;
  name: string | null;
  projectId: string | null;
  projectRole: 'ADMIN' | 'READ_WRITE' | 'VIEW' | null;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
}) {
  return {
    ...invite,
    projectId: invite.projectId!,
    projectRole: invite.projectRole!,
  };
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const access = await requireProjectAccess(params.id, session.user.id, 'ADMIN');
  if (!access) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const [members, invites] = await prisma.$transaction([
    prisma.projectMember.findMany({
      where: { projectId: params.id },
      orderBy: [
        { role: 'asc' },
        { createdAt: 'asc' },
      ],
      include: {
        user: { select: { id: true, email: true, name: true } },
      },
    }),
    prisma.inviteToken.findMany({
      where: {
        projectId: params.id,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  return NextResponse.json({
    members,
    invites: invites.map(serializeInvite),
  });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const access = await requireProjectAccess(params.id, session.user.id, 'ADMIN');
  if (!access) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const parsed = createMemberSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  }

  const normalizedEmail = parsed.data.email.toLowerCase().trim();
  const existingUser = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });

  if (existingUser) {
    if (existingUser.id === access.project.ownerId && parsed.data.role !== 'ADMIN') {
      return NextResponse.json({ error: 'The project creator must remain an admin' }, { status: 400 });
    }

    const member = await prisma.projectMember.upsert({
      where: {
        projectId_userId: {
          projectId: params.id,
          userId: existingUser.id,
        },
      },
      update: { role: parsed.data.role },
      create: {
        projectId: params.id,
        userId: existingUser.id,
        role: parsed.data.role,
      },
      include: {
        user: { select: { id: true, email: true, name: true } },
      },
    });

    await prisma.inviteToken.updateMany({
      where: {
        email: normalizedEmail,
        projectId: params.id,
        usedAt: null,
      },
      data: {
        expiresAt: new Date(),
      },
    });

    return NextResponse.json({
      type: 'member',
      member,
    }, { status: 201 });
  }

  await prisma.inviteToken.updateMany({
    where: {
      email: normalizedEmail,
      projectId: params.id,
      usedAt: null,
    },
    data: {
      expiresAt: new Date(),
    },
  });

  const token = generateToken();
  const invite = await prisma.inviteToken.create({
    data: {
      email: normalizedEmail,
      name: parsed.data.name?.trim() || null,
      token,
      expiresAt: expiresIn(72),
      createdBy: session.user.id,
      projectId: params.id,
      projectRole: parsed.data.role,
    },
  });

  try {
    await sendInviteEmail(normalizedEmail, parsed.data.name?.trim() || null, token, {
      projectName: access.project.name,
      projectRole: parsed.data.role,
    });
  } catch (err) {
    console.error('Failed to send project invite email:', err);
  }

  return NextResponse.json({
    type: 'invite',
    invite: serializeInvite(invite),
  }, { status: 201 });
}
