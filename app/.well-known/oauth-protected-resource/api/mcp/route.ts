// GET /.well-known/oauth-protected-resource/api/mcp — the RFC 9728 §3.1
// path-suffixed discovery location for our protected resource identifier
// ({origin}/api/mcp, which has a path component). Same metadata as the bare
// path — see ../../route.ts and ../../handler.ts.

export { protectedResourceMetadataGet as GET, protectedResourceMetadataOptions as OPTIONS } from '../../handler'
