import { NextRequest, NextResponse } from 'next/server';
import { getOrigin, MCP_OAUTH_SCOPES } from '@/lib/oauth';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const origin = getOrigin(req);

  return NextResponse.json({
    issuer: origin,
    authorization_endpoint: `${origin}/api/oauth/authorize`,
    token_endpoint: `${origin}/api/oauth/token`,
    registration_endpoint: `${origin}/api/oauth/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none', 'client_secret_basic', 'client_secret_post'],
    scopes_supported: MCP_OAUTH_SCOPES,
  });
}
