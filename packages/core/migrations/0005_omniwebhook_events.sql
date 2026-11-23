-- omniwebhook 0.1: the reservations table (omniwebhook_events) that makes each
-- incoming webhook take effect once, copied verbatim from postgresStoreSchema()
-- in omniwebhook. Keys are "<workspace id>:<scheme>:<event id>". An omniwebhook
-- release that changes that SQL needs a new migration; a unit test checks they
-- match.

CREATE TABLE IF NOT EXISTS omniwebhook_events (
  key text PRIMARY KEY,
  state text NOT NULL CHECK (state IN ('reserved', 'completed')),
  token text NOT NULL,
  expires_at bigint NOT NULL
);
