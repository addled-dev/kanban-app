import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { hash } from 'bcryptjs';
import { prisma } from '@/lib/prisma';

export async function GET(
  _req: NextRequest,
  { params }: { params: { token: string } }
) {
  const record = await prisma.passwordResetToken.findUnique({
    where: { token: params.token },
  });

  if (!record) return NextResponse.json({ error: 'Invalid reset link' }, { status: 404 });
  if (record.usedAt) return NextResponse.json({ error: 'Link already used' }, { status: 410 });
  if (record.expiresAt < new Date()) {
    return NextResponse.json({ error: 'Link has expired' }, { status: 410 });
  }

  return NextResponse.json({ valid: true });
}

const schema = z.object({ password: z.string().min(8).max(100) });

export async function POST(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  const record = await prisma.passwordResetToken.findUnique({
    where: { token: params.token },
    include: { user: true },
  });

  if (!record) return NextResponse.json({ error: 'Invalid reset link' }, { status: 404 });
  if (record.usedAt) return NextResponse.json({ error: 'Link already used' }, { status: 410 });
  if (record.expiresAt < new Date()) {
    return NextResponse.json({ error: 'Link has expired' }, { status: 410 });
  }

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  }

  const hashed = await hash(parsed.data.password, 12);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: record.userId },
      data: { password: hashed },
    }),
    prisma.passwordResetToken.update({
      where: { token: params.token },
      data: { usedAt: new Date() },
    }),
  ]);

  return NextResponse.json({ success: true });
}
