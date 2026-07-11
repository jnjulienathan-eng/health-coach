// GET /.well-known/oauth-protected-resource — RFC 9728 protected resource
// metadata. Points at this same app as its own (and only) authorization
// server — see app/oauth/* and lib/mcp-auth.ts.

import { protectedResourceHandler, metadataCorsOptionsRequestHandler, getPublicOrigin } from 'mcp-handler'

const handler = (req: Request) => {
  const origin = getPublicOrigin(req)
  return protectedResourceHandler({
    authServerUrls: [origin],
    resourceUrl: `${origin}/api/mcp`,
  })(req)
}

export { handler as GET }
export const OPTIONS = metadataCorsOptionsRequestHandler()
