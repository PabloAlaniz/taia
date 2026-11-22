/**
 * The Express app behind the MCP HTTP transport (see http.ts for the process
 * entry point). Kept apart from it so it can be started on any port in tests.
 */

import express from 'express'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { isAuthorized } from '@taia/core/auth'
import { mcpRateLimit } from './rate-limit'
import { createTaiaMcpServer } from './server'

/**
 * Hosts allowed by DNS-rebinding protection: localhost and the in-network
 * docker service name on `port`, plus MCP_ALLOWED_HOSTS (comma-separated).
 */
export function allowedHosts(
  port: number,
  env: Record<string, string | undefined> = process.env,
): string[] {
  return [
    'localhost',
    '127.0.0.1',
    `localhost:${port}`,
    `127.0.0.1:${port}`,
    'mcp',
    `mcp:${port}`,
    ...(env.MCP_ALLOWED_HOSTS?.split(',')
      .map((h) => h.trim())
      .filter(Boolean) ?? []),
  ]
}

export function createHttpApp(
  hosts: string[],
  env: Record<string, string | undefined> = process.env,
): express.Express {
  const app = express()
  app.use(express.json())

  app.get('/health', (_req, res) => {
    res.status(200).send('ok')
  })

  // Before the token check, so a flood of bad tokens is braked too.
  const limit = mcpRateLimit(env)
  if (limit) app.use('/mcp', limit)

  // With TAIA_API_TOKEN set, MCP clients send it as a bearer token
  // (`claude mcp add --header "Authorization: Bearer …"`).
  app.use('/mcp', async (req, res, next) => {
    const authorized = await isAuthorized({
      authorization: req.get('authorization'),
      apiKey: req.get('x-api-key'),
    })
    if (authorized) return next()
    res
      .status(401)
      .set('WWW-Authenticate', 'Bearer realm="TAIA"')
      .json({
        jsonrpc: '2.0',
        error: { code: -32001, message: 'Missing or invalid access token' },
        id: null,
      })
  })

  app.post('/mcp', async (req, res) => {
    // Stateless: new server + transport per request, closed when the response ends.
    const server = createTaiaMcpServer()
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableDnsRebindingProtection: true,
      allowedHosts: hosts,
    })

    res.on('close', () => {
      transport.close()
      server.close()
    })

    try {
      await server.connect(transport)
      await transport.handleRequest(req, res, req.body)
    } catch (err) {
      console.error('MCP request failed:', err)
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal server error' },
          id: null,
        })
      }
    }
  })

  // Streamable HTTP only needs POST in stateless mode; GET/DELETE are session ops.
  const methodNotAllowed = (_req: express.Request, res: express.Response) => {
    res.status(405).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Method not allowed (stateless server).' },
      id: null,
    })
  }
  app.get('/mcp', methodNotAllowed)
  app.delete('/mcp', methodNotAllowed)

  return app
}
