import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  generateAccessToken,
  parseClientCredentials,
  verifyClientSecret,
  verifyPkce,
} from '@/lib/oauth';
import { hashToken } from '@/lib/tokens';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function oauthError(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

export async function POST(req: NextRequest) {
  const contentType = req.headers.get('content-type') ?? '';
  const body = contentType.includes('application/json')
    ? new URLSearchParams(await req.json().catch(() => ({})))
    : new URLSearchParams(await req.text());

  if (body.get('grant_type') !== 'authorization_code') {
    return oauthError('unsupported_grant_type');
  }

  const { clientId, clientSecret } = parseClientCredentials(req, body);
  const client = await prisma.mcpOAuthClient.findUnique({
    where: { clientId },
    select: { id: true, clientSecretHash: true, redirectUris: true },
  });
  if (!client || !verifyClientSecret(clientSecret, client.clientSecretHash)) {
    return oauthError('invalid_client', 401);
  }

  const code = body.get('code');
  const redirectUri = body.get('redirect_uri');
  const codeVerifier = body.get('code_verifier');
  if (!code || !redirectUri || !codeVerifier) {
    return oauthError('invalid_request');
  }

  const authCode = await prisma.mcpOAuthAuthorizationCode.findUnique({
    where: { codeHash: hashToken(code) },
    select: {
      id: true,
      userId: true,
      clientId: true,
      redirectUri: true,
      codeChallenge: true,
      codeChallengeMethod: true,
      scope: true,
      expiresAt: true,
      usedAt: true,
    },
  });

  if (
    !authCode ||
    authCode.clientId !== client.id ||
    authCode.redirectUri !== redirectUri ||
    authCode.usedAt ||
    authCode.expiresAt.getTime() <= Date.now() ||
    !verifyPkce(codeVerifier, authCode.codeChallenge, authCode.codeChallengeMethod)
  ) {
    return oauthError('invalid_grant');
  }

  const accessToken = generateAccessToken();
  const expiresAt = new Date(Date.now() + ACCESS_TOKEN_TTL_SECONDS * 1000);

  await prisma.$transaction([
    prisma.mcpOAuthAuthorizationCode.update({
      where: { id: authCode.id },
      data: { usedAt: new Date() },
    }),
    prisma.mcpOAuthAccessToken.create({
      data: {
        userId: authCode.userId,
        clientId: client.id,
        tokenHash: hashToken(accessToken),
        scope: authCode.scope,
        expiresAt,
      },
    }),
    prisma.mcpOAuthClient.update({
      where: { id: client.id },
      data: { lastUsed: new Date() },
    }),
  ]);

  return NextResponse.json({
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: ACCESS_TOKEN_TTL_SECONDS,
    scope: authCode.scope,
  });
}
