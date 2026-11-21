/**
 * The interface the HTTP server listens on. Authentication is optional
 * (TAIA_API_TOKEN), so the default is this machine only; `MCP_HOST` (or
 * `TAIA_BIND_HOST`, which the Docker image sets to 0.0.0.0) widens it.
 */
export function resolveBindHost(env: Record<string, string | undefined> = process.env): string {
  return env.MCP_HOST?.trim() || env.TAIA_BIND_HOST?.trim() || '127.0.0.1'
}
