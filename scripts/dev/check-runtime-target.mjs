#!/usr/bin/env node

import http from 'node:http'
import https from 'node:https'

const APP_URL = (
  process.env.TAIA_APP_URL ||
  process.env.TAIA_URL ||
  'http://127.0.0.1:13333'
).replace(/\/$/, '')
const MCP_URL = process.env.TAIA_MCP_URL || 'http://127.0.0.1:13336/mcp'
const WORKSPACE_ID = process.env.TAIA_WORKSPACE_ID || process.env.WORKSPACE_ID || 'ws-default'
const TIMEOUT_MS = Number(process.env.TAIA_CHECK_TIMEOUT_SECONDS || 5) * 1000

function request(url, { method = 'GET', body, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const target = new URL(url)
    const client = target.protocol === 'https:' ? https : http
    const req = client.request(
      target,
      {
        method,
        headers: {
          Accept: 'application/json, text/event-stream',
          ...headers,
        },
        timeout: TIMEOUT_MS,
      },
      (res) => {
        let raw = ''
        res.setEncoding('utf8')
        res.on('data', (chunk) => {
          raw += chunk
        })
        res.on('end', () => {
          if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
            reject(
              new Error(`${method} ${url} returned HTTP ${res.statusCode}: ${raw.slice(0, 500)}`),
            )
            return
          }
          resolve(raw)
        })
      },
    )
    req.on('timeout', () =>
      req.destroy(new Error(`${method} ${url} timed out after ${TIMEOUT_MS}ms`)),
    )
    req.on('error', reject)
    if (body) req.write(body)
    req.end()
  })
}

function parseMcp(raw) {
  const dataLine = raw.split(/\r?\n/).find((line) => line.startsWith('data: '))
  return JSON.parse(dataLine ? dataLine.slice(6) : raw)
}

async function callMcp(id, method, params) {
  const raw = await request(MCP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
  })
  const payload = parseMcp(raw)
  if (payload.error) throw new Error(`MCP ${method} failed: ${JSON.stringify(payload.error)}`)
  return payload.result
}

function comparable(diagnostic) {
  return {
    workspace_id: diagnostic.workspace_id,
    db_database: diagnostic.db.database,
    db_user: diagnostic.db.user,
    db_server_addr: diagnostic.db.server_addr,
    db_server_port: diagnostic.db.server_port,
    db_oid: diagnostic.db.db_oid,
    workspace_exists: diagnostic.workspace.exists,
    task_count: diagnostic.workspace.task_count,
    active_task_count: diagnostic.workspace.active_task_count,
  }
}

function configSummary(diagnostic) {
  return {
    db_target_hash: diagnostic.db.target_hash,
    db_target_source: diagnostic.db.target_source,
    db_config_host: diagnostic.db.host,
    db_config_port: diagnostic.db.port,
  }
}

function diffTargets(app, mcp) {
  const keys = Object.keys(app)
  return keys
    .filter((key) => app[key] !== mcp[key])
    .map((key) => ({ key, app: app[key], mcp: mcp[key] }))
}

function recoveryHint() {
  return [
    'Recovery:',
    '  1. Stop stale local services: docker compose down (or stop the old pnpm dev/MCP process).',
    '  2. Verify one DATABASE_URL/POSTGRES_* target is intended for both app and MCP.',
    '  3. Restart from repo root: docker compose up -d --build  # or pnpm dev + pnpm -F @taia/mcp start:http.',
    `  4. Re-run: TAIA_WORKSPACE_ID=${WORKSPACE_ID} node scripts/dev/check-runtime-target.mjs`,
  ].join('\n')
}

async function main() {
  const appRaw = await request(
    `${APP_URL}/api/runtime-target?workspace_id=${encodeURIComponent(WORKSPACE_ID)}`,
  )
  const appPayload = JSON.parse(appRaw)
  if (!appPayload.ok)
    throw new Error(`Web API runtime-target failed: ${JSON.stringify(appPayload)}`)

  await callMcp(1, 'initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'taia-check-runtime-target', version: '1.0.0' },
  })
  const mcpResult = await callMcp(2, 'tools/call', {
    name: 'taia_runtime_target',
    arguments: { workspace_id: WORKSPACE_ID },
  })
  const text = mcpResult?.content?.find((item) => item.type === 'text')?.text
  if (!text) throw new Error('MCP taia_runtime_target did not return text content')
  const mcpDiagnostic = JSON.parse(text)

  const appComparable = comparable(appPayload.diagnostic)
  const mcpComparable = comparable(mcpDiagnostic)
  const diffs = diffTargets(appComparable, mcpComparable)

  console.log(`[check-runtime-target] app ${APP_URL} -> ${JSON.stringify(appComparable)}`)
  console.log(`[check-runtime-target] mcp ${MCP_URL} -> ${JSON.stringify(mcpComparable)}`)
  console.log(
    `[check-runtime-target] config app=${JSON.stringify(configSummary(appPayload.diagnostic))} mcp=${JSON.stringify(configSummary(mcpDiagnostic))}`,
  )

  if (diffs.length > 0) {
    console.error(
      '[check-runtime-target] ERROR: Web API and MCP point to divergent runtime targets:',
    )
    for (const diff of diffs) {
      console.error(
        `  - ${diff.key}: app=${JSON.stringify(diff.app)} mcp=${JSON.stringify(diff.mcp)}`,
      )
    }
    console.error(recoveryHint())
    process.exit(1)
  }

  if (!appComparable.workspace_exists || !mcpComparable.workspace_exists) {
    console.error(
      `[check-runtime-target] ERROR: workspace ${WORKSPACE_ID} is not visible from both services.`,
    )
    console.error(recoveryHint())
    process.exit(1)
  }

  console.log(
    `[check-runtime-target] DONE app and MCP agree on workspace_id=${WORKSPACE_ID}, db_oid=${appComparable.db_oid}, task_count=${appComparable.task_count}`,
  )
}

main().catch((error) => {
  console.error(
    `[check-runtime-target] ERROR: ${error instanceof Error ? error.message : String(error)}`,
  )
  console.error(recoveryHint())
  process.exit(1)
})
