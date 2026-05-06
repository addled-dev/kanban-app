import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { NextRequest } from 'next/server';
import { hashToken } from './tokens';

export const MCP_OAUTH_SCOPES = ['mcp:read', 'mcp:write'] as const;
export const AUTH_CODE_TTL_MINUTES = 10;
export const ACCESS_TOKEN_TTL_SECONDS = 12 * 60 * 60;

export function getOrigin(req: Request | NextRequest) {
  const forwardedProto = req.headers.get('x-forwarded-proto');
  const forwardedHost = req.headers.get('x-forwarded-host');
  if (forwardedHost) return `${forwardedProto ?? 'https'}://${forwardedHost}`;

  const url = req instanceof NextRequest ? req.nextUrl : new URL(req.url);
  return url.origin;
}

export function mcpResourceUrl(origin: string) {
  return `${origin}/api/mcp/sse`;
}

export function protectedResourceMetadataUrl(origin: string) {
  return `${origin}/.well-known/oauth-protected-resource`;
}

export function generateClientId() {
  return `mcp_${randomBytes(16).toString('hex')}`;
}

export function generateClientSecret() {
  return `mcp_secret_${randomBytes(32).toString('hex')}`;
}

export function generateAuthorizationCode() {
  return `mcp_code_${randomBytes(32).toString('hex')}`;
}

export function generateAccessToken() {
  return `mcp_at_${randomBytes(32).toString('hex')}`;
}

export function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function verifyPkce(codeVerifier: string, codeChallenge: string, method: string) {
  if (method !== 'S256') return false;
  const digest = createHash('sha256').update(codeVerifier).digest();
  const expected = digest.toString('base64url');
  return safeEqual(expected, codeChallenge);
}

export function normalizeScope(scope: string | null | undefined) {
  if (!scope) return MCP_OAUTH_SCOPES.join(' ');
  const requested = scope.split(/\s+/).filter(Boolean);
  const allowed = requested.filter((value) => MCP_OAUTH_SCOPES.includes(value as (typeof MCP_OAUTH_SCOPES)[number]));
  return Array.from(new Set(allowed)).join(' ') || MCP_OAUTH_SCOPES.join(' ');
}

export function isAllowedRedirectUri(redirectUri: string, allowedRedirectUris: string[]) {
  try {
    const parsed = new URL(redirectUri);
    if (parsed.protocol !== 'https:' && parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') {
      return false;
    }
    return allowedRedirectUris.includes(parsed.toString());
  } catch {
    return false;
  }
}

export function parseClientCredentials(req: NextRequest, body: URLSearchParams) {
  const auth = req.headers.get('authorization');
  if (auth?.startsWith('Basic ')) {
    const decoded = Buffer.from(auth.slice('Basic '.length), 'base64').toString('utf8');
    const [clientId, clientSecret = ''] = decoded.split(':');
    return { clientId, clientSecret };
  }

  return {
    clientId: body.get('client_id') ?? '',
    clientSecret: body.get('client_secret') ?? '',
  };
}

export function verifyClientSecret(rawSecret: string, secretHash: string | null) {
  if (!secretHash) return true;
  if (!rawSecret) return false;
  return safeEqual(hashToken(rawSecret), secretHash);
}
