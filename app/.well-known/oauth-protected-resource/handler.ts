// Shared GET/OPTIONS handler for RFC 9728 protected resource metadata.
// Served at two locations (see the two route.ts files that import this):
//   - /.well-known/oauth-protected-resource            (bare path)
//   - /.well-known/oauth-protected-resource/api/mcp     (path-suffixed)
//
// RFC 9728 §3.1 constructs the well-known URI by inserting the well-known
// path segment between the host component and the resource identifier's
// own path/query, when the resource identifier has one. Our resource is
// {origin}/api/mcp (not the bare origin), so the suffixed location above is
// a valid discovery URL some clients probe directly instead of the bare
// path — both must return the same metadata.

import { protectedResourceHandler, metadataCorsOptionsRequestHandler, getPublicOrigin } from 'mcp-handler'

export const protectedResourceMetadataGet = (req: Request) => {
  const origin = getPublicOrigin(req)
  return protectedResourceHandler({
    authServerUrls: [origin],
    resourceUrl: `${origin}/api/mcp`,
  })(req)
}

export const protectedResourceMetadataOptions = metadataCorsOptionsRequestHandler()
