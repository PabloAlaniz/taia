#!/usr/bin/env node
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import http from 'node:http'
import { once } from 'node:events'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const script = resolve(root, 'scripts/dev/check-local-stack.sh')
const workspaceId = 'ws-test'

function createJsonServer(handler) {
  const server = http.createServer(handler)
  return new Promise((resolveServer, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject)
      const address = server.address()
      resolveServer({ server, url: `http://127.0.0.1:${address.port}` })
    })
  })
}

function readBody(req) {
  return new Promise((resolveBody) => {
    let body = ''
    req.setEncoding('utf8')
    req.on('data', (chunk) => {
      body += chunk
    })
    req.on('end', () => resolveBody(body))
  })
}

function sendJson(res, status, payload) {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(payload))
}

function sendSse(res, payload) {
  res.writeHead(200, { 'content-type': 'text/event-stream' })
  res.end(`event: message\ndata: ${JSON.stringify(payload)}\n\n`)
}

async function runCheck(env) {
  const child = spawn('bash', [script], {
    cwd: root,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let stdout = ''
  let stderr = ''
  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')
  child.stdout.on('data', (chunk) => {
    stdout += chunk
  })
  child.stderr.on('data', (chunk) => {
    stderr += chunk
  })
  const [code] = await once(child, 'exit')
  return { code, stdout, stderr }
}

async function main() {
  const matchingDiagnostic = {
    service: 'test',
    generated_at: '2026-09-04T00:00:00.000Z',
    workspace_id: workspaceId,
    db: {
      reachable: true,
      target_hash: 'same-db-target',
      target_source: 'POSTGRES_*',
      database: 'taia_test',
      user: 'taia',
      host: '127.0.0.1',
      port: 5432,
      server_addr: '127.0.0.1',
      server_port: 5432,
      db_oid: 12345,
      postgres_version_num: 170000,
    },
    workspace: { exists: true, task_count: 1, active_task_count: 1 },
  }

  const app = await createJsonServer((req, res) => {
    if (req.url === '/api/health') {
      sendJson(res, 200, { status: 'healthy', db: { connected: true } })
      return
    }
    if (req.url === `/api/tasks?workspace_id=${workspaceId}`) {
      sendJson(res, 200, {
        tasks: [{ id: 'task-1', title: 'Task 1', workspace_id: workspaceId }],
        total: 1,
      })
      return
    }
    if (req.url === `/api/runtime-target?workspace_id=${workspaceId}`) {
      sendJson(res, 200, { ok: true, diagnostic: { ...matchingDiagnostic, service: 'web-api' } })
      return
    }
    sendJson(res, 404, { error: 'not found' })
  })

  const mcp = await createJsonServer(async (req, res) => {
    if (req.method !== 'POST' || req.url !== '/mcp') {
      sendJson(res, 404, { error: 'not found' })
      return
    }
    const body = JSON.parse(await readBody(req))
    if (body.method === 'initialize') {
      sendSse(res, {
        jsonrpc: '2.0',
        id: body.id,
        result: { serverInfo: { name: 'taia-test', version: '0.0.0' } },
      })
      return
    }
    if (body.method === 'tools/call') {
      assert.equal(body.params.arguments.workspace_id, workspaceId)
      if (body.params.name === 'taia_list_tasks') {
        sendSse(res, {
          jsonrpc: '2.0',
          id: body.id,
          result: {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  tasks: [{ id: 'task-1', title: 'Task 1', workspace_id: workspaceId }],
                  total: 1,
                }),
              },
            ],
          },
        })
        return
      }
      if (body.params.name === 'taia_runtime_target') {
        sendSse(res, {
          jsonrpc: '2.0',
          id: body.id,
          result: {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ ...matchingDiagnostic, service: 'mcp' }),
              },
            ],
          },
        })
        return
      }
    }
    sendSse(res, { jsonrpc: '2.0', id: body.id, error: { message: 'unknown method' } })
  })

  try {
    const ok = await runCheck({
      TAIA_APP_URL: app.url,
      TAIA_MCP_URL: `${mcp.url}/mcp`,
      TAIA_WORKSPACE_ID: workspaceId,
    })
    assert.equal(ok.code, 0, ok.stderr)
    assert.match(ok.stdout, /DONE/)
    assert.match(ok.stdout, new RegExp(`workspace_id=${workspaceId}`))

    const mismatchApp = await createJsonServer((req, res) => {
      if (req.url === '/api/health') {
        sendJson(res, 200, { status: 'healthy', db: { connected: true } })
        return
      }
      if (req.url === `/api/tasks?workspace_id=${workspaceId}`) {
        sendJson(res, 200, {
          tasks: [{ id: 'task-1', title: 'Task 1', workspace_id: workspaceId }],
          total: 1,
        })
        return
      }
      if (req.url === `/api/runtime-target?workspace_id=${workspaceId}`) {
        sendJson(res, 200, {
          ok: true,
          diagnostic: {
            ...matchingDiagnostic,
            service: 'web-api',
            db: { ...matchingDiagnostic.db, db_oid: 99999 },
          },
        })
        return
      }
      sendJson(res, 404, { error: 'not found' })
    })
    try {
      const failed = await runCheck({
        TAIA_APP_URL: mismatchApp.url,
        TAIA_MCP_URL: `${mcp.url}/mcp`,
        TAIA_WORKSPACE_ID: workspaceId,
      })
      assert.notEqual(failed.code, 0)
      assert.match(failed.stderr, /divergent runtime targets/)
      assert.match(failed.stderr, /db_oid/)
    } finally {
      mismatchApp.server.close()
    }
  } finally {
    app.server.close()
    mcp.server.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
