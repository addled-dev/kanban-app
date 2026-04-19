import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { requireTaskAccess } from '@/lib/project-access';

const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';

export async function GET(
  _req: NextRequest,
  { params }: { params: { taskId: string; filename: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const taskAccess = await requireTaskAccess(params.taskId, session.user.id, 'VIEW');
  if (!taskAccess) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const attachment = await prisma.attachment.findFirst({
    where: {
      url: `/api/files/${params.taskId}/${params.filename}`,
      taskId: params.taskId,
    },
  });
  if (!attachment) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  try {
    const buffer = await readFile(join(UPLOAD_DIR, params.taskId, params.filename));
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': attachment.mimeType || 'application/octet-stream',
        'Content-Disposition': `inline; filename="${attachment.filename}"`,
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch {
    return NextResponse.json({ error: 'File not found on disk' }, { status: 404 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { taskId: string; filename: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const taskAccess = await requireTaskAccess(params.taskId, session.user.id, 'READ_WRITE');
  if (!taskAccess) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const attachment = await prisma.attachment.findFirst({
    where: {
      url: `/api/files/${params.taskId}/${params.filename}`,
      taskId: params.taskId,
    },
  });
  if (!attachment) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await prisma.attachment.delete({ where: { id: attachment.id } });
  return NextResponse.json({ success: true });
}
