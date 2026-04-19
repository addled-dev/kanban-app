import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { prisma } from '@/lib/prisma';
import { buildMcpServer } from '@/lib/mcp-server';
import { mcpSessions, NextJsTransport } from '@/lib/mcp-sessions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  // ── Authenticate ──────────────────────────────────────────────
  const apiKey = req.headers.get('x-api-key');
  if (!apiKey) {
    return NextResponse.json({ error: 'X-Api-Key header required' }, { status: 401 });
  }

  const keyHash = createHash('sha256').update(apiKey).digest('hex');
  const keyRecord = await prisma.mcpApiKey.findUnique({
    where: { keyHash },
    include: { user: { select: { id: true, email: true, role: true } } },
  });

  if (!keyRecord) {
    return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
  }

  // Update lastUsed asynchronously (don't await)
  prisma.mcpApiKey.update({
    where: { id: keyRecord.id },
    data: { lastUsed: new Date() },
  }).catch(() => {});

  const userId = keyRecord.userId;

  // ── Build SSE stream ──────────────────────────────────────────
  let transport: NextJsTransport | undefined;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      transport = new NextJsTransport(controller);
      const server = buildMcpServer(userId);
      mcpSessions.set(transport.sessionId, { transport, server, userId });
      // connect() calls transport.start() which sends the endpoint SSE event
      server.connect(transport as any).catch((err: Error) => {
        console.error('MCP connect error:', err);
        controller.error(err);
      });
    },
    cancel() {
      if (transport) {
        mcpSessions.delete(transport.sessionId);
        transport.triggerClose();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
