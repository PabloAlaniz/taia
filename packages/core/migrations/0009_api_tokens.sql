-- Access tokens for agents, MCP clients, the CLI and the VS Code extension,
-- created and revoked from the web UI (see services/access-token.service.ts).
--
-- A token reads `taia_<id>_<secret>`. Only a SHA-256 of the secret is kept:
-- the secret is 32 random bytes, so a fast hash is enough and the full token
-- is shown once, when it is created. The id is public and finds the row.
--
-- scope: 'admin' may do everything, including managing tokens; 'agent' may
-- use the API and the MCP server but not manage tokens or reveal credentials.
CREATE TABLE api_tokens (
  id           text PRIMARY KEY,
  name         text NOT NULL,
  scope        text NOT NULL CHECK (scope IN ('admin', 'agent')),
  token_hash   text NOT NULL,
  created_by   text NOT NULL DEFAULT 'unknown',
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  expires_at   timestamptz,
  revoked_at   timestamptz
);

CREATE INDEX api_tokens_created_idx ON api_tokens (created_at DESC);
