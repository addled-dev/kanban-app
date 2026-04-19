import { NextRequest, NextResponse } from 'next/server';
import { mcpSessions } from '@/lib/mcp-sessions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get('sessionId');
  if (!sessionId) {
    return NextResponse.json({ error: 'sessionId query param required' }, { status: 400 });
  }

  const session = mcpSessions.get(sessionId);
  if (!session) {
    return NextResponse.json({ error: 'Session not found or expired' }, { status: 404 });
  }

  let message: Record<string, unknown>;
  try {
    message = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // Dispatch to the MCP server via the transport's onmessage callback
  session.transport.onmessage?.(message);

  // Responses travel back via the SSE stream — return 202 Accepted
  return new NextResponse(null, { status: 202 });
}
