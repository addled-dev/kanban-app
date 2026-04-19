import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { writeFile, mkdir } from 'fs/promises';
import { join, extname } from 'path';
import { randomUUID } from 'crypto';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { requireTaskAccess } from '@/lib/project-access';

const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';
const MAX_SIZE = 10 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  const taskId = formData.get('taskId') as string | null;
  if (!file || !taskId) return NextResponse.json({ error: 'file and taskId required' }, { status: 400 });
  if (file.size > MAX_SIZE) return NextResponse.json({ error: 'File too large (max 10MB)' }, { status: 413 });

  const access = await requireTaskAccess(taskId, session.user.id, 'READ_WRITE');
  if (!access) return NextResponse.json({ error: 'Task not found' }, { status: 404 });

  const ext = extname(file.name) || '';
  const storedName = `${randomUUID()}${ext}`;
  const dir = join(UPLOAD_DIR, taskId);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, storedName), Buffer.from(await file.arrayBuffer()));

  const attachment = await prisma.attachment.create({
    data: {
      taskId,
      filename: file.name,
      url: `/api/files/${taskId}/${storedName}`,
      size: file.size,
      mimeType: file.type || null,
    },
  });
  return NextResponse.json(attachment, { status: 201 });
}
