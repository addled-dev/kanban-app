import { NextRequest, NextResponse } from 'next/server';
import { getOrigin, mcpResourceUrl, protectedResourceMetadataUrl, MCP_OAUTH_SCOPES } from '@/lib/oauth';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const origin = getOrigin(req);

  return NextResponse.json({
    resource: mcpResourceUrl(origin),
    authorization_servers: [origin],
    scopes_supported: MCP_OAUTH_SCOPES,
    bearer_methods_supported: ['header'],
    resource_documentation: `${origin}/settings/api-keys`,
    resource_metadata: protectedResourceMetadataUrl(origin),
  });
}
