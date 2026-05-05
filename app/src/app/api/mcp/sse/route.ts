import { NextRequest, NextResponse } from 'next/server';
import { buildMcpServer } from '@/lib/mcp-server';
import { mcpSessions, NextJsTransport } from '@/lib/mcp-sessions';
import { authenticateMcpRequest, mcpAuthErrorResponse } from '@/lib/mcp-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await authenticateMcpRequest(req);
  if (!auth) return mcpAuthErrorResponse();
  const userId = auth.userId;

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
