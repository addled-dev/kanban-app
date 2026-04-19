import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { generateToken, expiresIn } from '@/lib/tokens';
import { sendInviteEmail } from '@/lib/email';

const schema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100),
});

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user || user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  }

  const { email, name } = parsed.data;
  const normalizedEmail = email.toLowerCase().trim();

  // Check if user already exists
  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) {
    return NextResponse.json({ error: 'A user with this email already exists' }, { status: 409 });
  }

  // Invalidate any existing unused invites for this email
  await prisma.inviteToken.updateMany({
    where: { email: normalizedEmail, usedAt: null, projectId: null },
    data: { expiresAt: new Date() }, // expire them now
  });

  const token = generateToken();
  const invite = await prisma.inviteToken.create({
    data: {
      email: normalizedEmail,
      name,
      token,
      expiresAt: expiresIn(72),
      createdBy: session.user.id,
    },
  });

  try {
    await sendInviteEmail(normalizedEmail, name, token);
  } catch (err) {
    console.error('Failed to send invite email:', err);
    // Don't fail the request — admin can resend
  }

  return NextResponse.json(
    { id: invite.id, email: invite.email, name: invite.name, expiresAt: invite.expiresAt },
    { status: 201 }
  );
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user || user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const invites = await prisma.inviteToken.findMany({
    where: { projectId: null },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json(invites);
}
