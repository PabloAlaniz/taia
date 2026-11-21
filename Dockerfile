# TAIA - Tablero de Agentes IA - Production Build
FROM node:26-slim AS base

# No telemetry calls from the Next.js build or server.
ENV NEXT_TELEMETRY_DISABLED=1

# Inside a container the servers have to listen on every interface to be
# reachable through the published ports; docker-compose.yml publishes them on
# 127.0.0.1 only. Outside Docker the default is 127.0.0.1.
ENV TAIA_BIND_HOST=0.0.0.0

# Install pnpm (pinned to match package.json's packageManager field) and system deps
RUN npm install -g pnpm@9.15.4 && \
    apt-get update && apt-get install -y curl postgresql-client && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy workspace config first (cache layer)
COPY pnpm-workspace.yaml pnpm-lock.yaml turbo.json package.json .npmrc ./
COPY packages/types/package.json packages/types/
COPY packages/core/package.json packages/core/
COPY packages/domain/package.json packages/domain/
COPY packages/runtime/package.json packages/runtime/
COPY apps/web/package.json apps/web/
COPY apps/mcp/package.json apps/mcp/
COPY tools/cli/package.json tools/cli/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build Next.js
RUN pnpm turbo build --filter=@taia/web

# Copy migration entrypoint
COPY scripts/docker/entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Expose ports: Next.js + WebSocket + Broadcast + MCP (HTTP transport)
EXPOSE 13333 13334 13335 13336

# Run as the unprivileged `node` user. The web app writes its Next cache and
# QA artifacts (.taia/) under apps/web; mount a writable volume for any other
# path you point TAIA at (repo clones, worktrees).
RUN chown -R node:node /app/apps/web
USER node

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["pnpm", "-F", "@taia/web", "start"]
