-- omniwebhook 0.2: the delivery ledger (omniwebhook_attempts), one row per
-- outgoing webhook attempt, copied verbatim from postgresLedgerSchema() in
-- omniwebhook. Endpoint ids are "<workspace id>/<endpoint id>". An omniwebhook
-- release that changes that SQL needs a new migration; a unit test checks they
-- match.

CREATE TABLE IF NOT EXISTS omniwebhook_attempts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  message_id text NOT NULL,
  endpoint_id text NOT NULL,
  attempt integer NOT NULL,
  at bigint NOT NULL,
  delivery_class text NOT NULL,
  state text NOT NULL,
  status integer,
  problem text,
  duration_ms bigint NOT NULL,
  next_at bigint
);
CREATE INDEX IF NOT EXISTS omniwebhook_attempts_message_idx ON omniwebhook_attempts (message_id, endpoint_id);
CREATE INDEX IF NOT EXISTS omniwebhook_attempts_endpoint_idx ON omniwebhook_attempts (endpoint_id, at);
