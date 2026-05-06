import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import {
  AUTH_CODE_TTL_MINUTES,
  generateAuthorizationCode,
  getOrigin,
  isAllowedRedirectUri,
  normalizeScope,
} from '@/lib/oauth';
import { hashToken } from '@/lib/tokens';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function redirectWithError(redirectUri: string, error: string, state: string | null) {
  const url = new URL(redirectUri);
  url.searchParams.set('error', error);
  if (state) url.searchParams.set('state', state);
  return NextResponse.redirect(url);
}

export async function GET(req: NextRequest) {
  const origin = getOrigin(req);
  const session = await getServerSession(authOptions);
  if (!session) {
    const callbackUrl = `${origin}${req.nextUrl.pathname}${req.nextUrl.search}`;
    return NextResponse.redirect(`${origin}/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  }

  const responseType = req.nextUrl.searchParams.get('response_type');
  const clientId = req.nextUrl.searchParams.get('client_id');
  const redirectUri = req.nextUrl.searchParams.get('redirect_uri');
  const codeChallenge = req.nextUrl.searchParams.get('code_challenge');
  const codeChallengeMethod = req.nextUrl.searchParams.get('code_challenge_method');
  const state = req.nextUrl.searchParams.get('state');
  const scope = normalizeScope(req.nextUrl.searchParams.get('scope'));

  if (responseType !== 'code' || !clientId || !redirectUri || !codeChallenge || codeChallengeMethod !== 'S256') {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }

  const client = await prisma.mcpOAuthClient.findUnique({
    where: { clientId },
    select: { id: true, userId: true, redirectUris: true },
  });
  if (!client) return NextResponse.json({ error: 'invalid_client' }, { status: 400 });
  if (!isAllowedRedirectUri(redirectUri, client.redirectUris)) {
    return NextResponse.json({ error: 'invalid_redirect_uri' }, { status: 400 });
  }
  if (client.userId && client.userId !== session.user.id) {
    return redirectWithError(redirectUri, 'access_denied', state);
  }
  if (!client.userId) {
    await prisma.mcpOAuthClient.update({
      where: { id: client.id },
      data: { userId: session.user.id },
    });
  }

  const code = generateAuthorizationCode();
  await prisma.mcpOAuthAuthorizationCode.create({
    data: {
      userId: session.user.id,
      clientId: client.id,
      codeHash: hashToken(code),
      redirectUri,
      codeChallenge,
      codeChallengeMethod,
      scope,
      expiresAt: new Date(Date.now() + AUTH_CODE_TTL_MINUTES * 60 * 1000),
    },
  });

  const next = new URL(redirectUri);
  next.searchParams.set('code', code);
  if (state) next.searchParams.set('state', state);
  return NextResponse.redirect(next);
}
