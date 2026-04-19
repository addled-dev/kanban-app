import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { generateApiKey, hashToken } from '@/lib/tokens';

const createSchema = z.object({
  name: z.string().min(1).max(80).describe('A label for this key, e.g. "Claude Desktop"'),
});

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const keys = await prisma.mcpApiKey.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      lastUsed: true,
      createdAt: true,
      // Never return keyHash
    },
  });

  return NextResponse.json(keys);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  }

  const rawKey = generateApiKey();
  const keyHash = hashToken(rawKey);

  const record = await prisma.mcpApiKey.create({
    data: {
      userId: session.user.id,
      name: parsed.data.name,
      keyHash,
    },
    select: { id: true, name: true, createdAt: true },
  });

  // Return the raw key ONCE — it cannot be recovered after this
  return NextResponse.json({ ...record, key: rawKey }, { status: 201 });
}
