import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { generateClientId, generateClientSecret, isAllowedRedirectUri } from '@/lib/oauth';
import { hashToken } from '@/lib/tokens';

const createSchema = z.object({
  name: z.string().min(1).max(120),
  redirectUris: z.array(z.string().url()).min(1).max(10),
  confidential: z.boolean().optional(),
});

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const clients = await prisma.mcpOAuthClient.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      clientId: true,
      redirectUris: true,
      tokenEndpointAuthMethod: true,
      lastUsed: true,
      createdAt: true,
      _count: { select: { accessTokens: true } },
    },
  });

  return NextResponse.json(clients);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  }

  const redirectUris = parsed.data.redirectUris.map((uri) => new URL(uri).toString());
  if (redirectUris.some((uri) => !isAllowedRedirectUri(uri, redirectUris))) {
    return NextResponse.json(
      { error: 'Redirect URIs must be HTTPS, localhost, or 127.0.0.1 URLs.' },
      { status: 400 }
    );
  }

  const clientSecret = parsed.data.confidential ? generateClientSecret() : null;
  const client = await prisma.mcpOAuthClient.create({
    data: {
      userId: session.user.id,
      name: parsed.data.name,
      clientId: generateClientId(),
      clientSecretHash: clientSecret ? hashToken(clientSecret) : null,
      redirectUris,
      tokenEndpointAuthMethod: clientSecret ? 'client_secret_post' : 'none',
    },
    select: {
      id: true,
      name: true,
      clientId: true,
      redirectUris: true,
      tokenEndpointAuthMethod: true,
      lastUsed: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ ...client, clientSecret, _count: { accessTokens: 0 } }, { status: 201 });
}
