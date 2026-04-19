import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { randomUUID } from 'crypto';

export type JSONRPCMessage = Record<string, unknown>;

/**
 * Custom Transport that adapts Next.js ReadableStream controller
 * to the MCP SDK Transport interface.
 */
export class NextJsTransport {
  readonly sessionId: string;
  private controller: ReadableStreamDefaultController<Uint8Array>;
  private encoder = new TextEncoder();

  onclose?: () => void;
  onerror?: (err: Error) => void;
  onmessage?: (msg: JSONRPCMessage) => void;

  constructor(controller: ReadableStreamDefaultController<Uint8Array>) {
    this.controller = controller;
    this.sessionId = randomUUID();
  }

  async start(): Promise<void> {
    // MCP spec: first event tells the client where to POST messages
    this._write(`event: endpoint\ndata: /api/mcp/messages?sessionId=${this.sessionId}\n\n`);
  }

  async send(message: JSONRPCMessage): Promise<void> {
    this._write(`event: message\ndata: ${JSON.stringify(message)}\n\n`);
  }

  async close(): Promise<void> {
    try {
      this.controller.close();
    } catch {
      // already closed
    }
    this.onclose?.();
  }

  /** Called from the stream's cancel() callback when client disconnects */
  triggerClose(): void {
    this.onclose?.();
  }

  private _write(text: string): void {
    try {
      this.controller.enqueue(this.encoder.encode(text));
    } catch {
      // stream already closed
    }
  }
}

interface McpSession {
  transport: NextJsTransport;
  server: McpServer;
  userId: string;
}

// Global singleton map — safe in a long-running Node.js Docker process
declare global {
  // eslint-disable-next-line no-var
  var _mcpSessions: Map<string, McpSession> | undefined;
}

export const mcpSessions: Map<string, McpSession> =
  globalThis._mcpSessions ?? (globalThis._mcpSessions = new Map());
