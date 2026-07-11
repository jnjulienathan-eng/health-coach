// GET /.well-known/oauth-protected-resource — RFC 9728 protected resource
// metadata. Points at this same app as its own (and only) authorization
// server — see app/oauth/* and lib/mcp-auth.ts. Also served at the RFC 9728
// §3.1 path-suffixed location — see api/mcp/route.ts in this directory —
// since our resource identifier ({origin}/api/mcp) has a path component.

export { protectedResourceMetadataGet as GET, protectedResourceMetadataOptions as OPTIONS } from './handler'
