import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { generateClientId, generateClientSecret, isAllowedRedirectUri } from '@/lib/oauth';
import { hashToken } from '@/lib/tokens';

export const runtime = 'nodejs';

const registerSchema = z.object({
  client_name: z.string().min(1).max(120).optional(),
  redirect_uris: z.array(z.string().url()).min(1).max(10),
  token_endpoint_auth_method: z.enum(['none', 'client_secret_post', 'client_secret_basic']).optional(),
});

export async function POST(req: NextRequest) {
  const parsed = registerSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_client_metadata' }, { status: 400 });
  }

  const redirectUris = parsed.data.redirect_uris.map((uri) => new URL(uri).toString());
  if (redirectUris.some((uri) => !isAllowedRedirectUri(uri, redirectUris))) {
    return NextResponse.json({ error: 'invalid_redirect_uri' }, { status: 400 });
  }

  const authMethod = parsed.data.token_endpoint_auth_method ?? 'none';
  const clientId = generateClientId();
  const clientSecret = authMethod === 'none' ? null : generateClientSecret();

  await prisma.mcpOAuthClient.create({
    data: {
      name: parsed.data.client_name ?? 'Dynamic MCP client',
      clientId,
      clientSecretHash: clientSecret ? hashToken(clientSecret) : null,
      tokenEndpointAuthMethod: authMethod,
      redirectUris,
    },
  });

  return NextResponse.json(
    {
      client_id: clientId,
      ...(clientSecret ? { client_secret: clientSecret } : {}),
      client_name: parsed.data.client_name ?? 'Dynamic MCP client',
      redirect_uris: redirectUris,
      token_endpoint_auth_method: authMethod,
      grant_types: ['authorization_code'],
      response_types: ['code'],
    },
    { status: 201 }
  );
}
