import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const key = await prisma.mcpApiKey.findFirst({
    where: { id: params.id, userId: session.user.id },
  });
  if (!key) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await prisma.mcpApiKey.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true });
}
