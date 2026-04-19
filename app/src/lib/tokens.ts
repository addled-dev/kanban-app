import { randomBytes, createHash } from 'crypto';

/** Generate a cryptographically random URL-safe token */
export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString('hex');
}

/** Generate a prefixed MCP API key: kb_<64 hex chars> */
export function generateApiKey(): string {
  return `kb_${randomBytes(32).toString('hex')}`;
}

/** SHA-256 hash a value for storage */
export function hashToken(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Return a Date that is `hours` from now */
export function expiresIn(hours: number): Date {
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}
