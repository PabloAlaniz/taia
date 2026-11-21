// Bootstrap configuration from env vars — fallback defaults for when DB is not available.
// Most settings are also configurable from the UI (/settings).
// For worktree and timezone: DB settings take precedence over env vars.
// The agent runtime is configured only from the DB (/settings/runtime).

// Ports of the local processes. Outside Docker they are also what `pnpm dev`
// and `pnpm start` listen on, so the default URLs below follow them.
const appPort = parseInt(process.env.APP_PORT || '13333')
const wsPort = parseInt(process.env.WS_PORT || '13334')
const broadcastPort = parseInt(process.env.BROADCAST_PORT || '13335')

export const config = {
  db: {
    connectionString: process.env.DATABASE_URL,
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432'),
    user: process.env.POSTGRES_USER || 'taia',
    password: process.env.POSTGRES_PASSWORD || 'taia',
    database: process.env.POSTGRES_DB || 'taia',
    maxConnections: 20,
  },
  broadcast: {
    url: process.env.BROADCAST_URL || `http://localhost:${broadcastPort}/broadcast`,
  },
  ws: {
    port: wsPort,
    clientUrl: process.env.WS_CLIENT_URL || `ws://localhost:${wsPort}`,
    reconnectDelay: 3000,
  },
  taia: {
    url: process.env.TAIA_URL || `http://localhost:${appPort}`,
  },
  notifications: {
    pollIntervalMs: parseInt(process.env.POLL_INTERVAL_MS || '5000'),
  },
  cron: {
    defaultTz: process.env.CRON_DEFAULT_TZ || 'UTC',
  },
  worktree: {
    basePath: process.env.WORKTREE_BASE_PATH || '/tmp/taia-worktrees',
    repoClonePath: process.env.WORKTREE_REPO_PATH || '/tmp/taia-repos',
    cleanupAfterHours: parseInt(process.env.WORKTREE_CLEANUP_HOURS || '72'),
    setupCommand: process.env.WORKTREE_SETUP_CMD || '',
    autoCleanup: process.env.WORKTREE_AUTO_CLEANUP !== 'false',
    autoCreateOnAssign: process.env.WORKTREE_AUTO_CREATE === 'true',
  },
} as const
