import { createHash } from 'crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { prisma } from './prisma';

const OAUTH_ISSUER = process.env.MCP_OAUTH_ISSUER;
const OAUTH_AUDIENCE = process.env.MCP_OAUTH_AUDIENCE;
const OAUTH_JWKS_URL = process.env.MCP_OAUTH_JWKS_URL;

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJwks() {
  if (!OAUTH_JWKS_URL) return null;
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(OAUTH_JWKS_URL));
  }
  return jwks;
}

async function authenticateWithApiKey(rawApiKey: string) {
  const keyHash = createHash('sha256').update(rawApiKey).digest('hex');
  const keyRecord = await prisma.mcpApiKey.findUnique({
    where: { keyHash },
    select: { id: true, userId: true },
  });
  if (!keyRecord) return null;

  prisma.mcpApiKey.update({
    where: { id: keyRecord.id },
    data: { lastUsed: new Date() },
  }).catch(() => {});

  return {
    userId: keyRecord.userId,
    method: 'api_key' as const,
  };
}

async function authenticateWithBearerToken(token: string) {
  const keyset = getJwks();
  if (!keyset || !OAUTH_ISSUER) return null;

  const { payload } = await jwtVerify(token, keyset, {
    issuer: OAUTH_ISSUER,
    audience: OAUTH_AUDIENCE,
  });

  const claimedEmail =
    (typeof payload.email === 'string' && payload.email) ||
    (typeof payload.preferred_username === 'string' && payload.preferred_username) ||
    null;

  if (!claimedEmail) return null;

  const user = await prisma.user.findUnique({
    where: { email: claimedEmail.toLowerCase().trim() },
    select: { id: true },
  });
  if (!user) return null;

  return {
    userId: user.id,
    method: 'oauth_bearer' as const,
  };
}

export async function authenticateMcpRequest(req: Request) {
  const apiKey = req.headers.get('x-api-key');
  if (apiKey) {
    const byKey = await authenticateWithApiKey(apiKey);
    if (byKey) return byKey;
  }

  const authHeader = req.headers.get('authorization');
  const match = authHeader?.match(/^Bearer\s+(.+)$/i);
  if (match) {
    try {
      const byToken = await authenticateWithBearerToken(match[1]);
      if (byToken) return byToken;
    } catch {
      return null;
    }
  }

  return null;
}

export function mcpAuthErrorResponse() {
  return new Response(
    JSON.stringify({
      error: 'Provide X-Api-Key or Authorization: Bearer <token>',
    }),
    {
      status: 401,
      headers: {
        'Content-Type': 'application/json',
        'WWW-Authenticate': 'Bearer realm="kanban-mcp"',
      },
    }
  );
}
