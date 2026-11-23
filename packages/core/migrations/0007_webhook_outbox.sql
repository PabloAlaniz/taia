-- Outgoing webhooks wait here until they are delivered. Emitting an event only
-- inserts a row, so the request that caused it never waits on the receiver;
-- the dispatcher in the web process sends what is due and, when a delivery
-- has to be retried, sets next_at to when omniwebhook says to try again.
--
-- payload is text, not jsonb: it holds the exact bytes that get signed, and
-- every attempt must send the same ones.
CREATE TABLE webhook_outbox (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  workspace_id text NOT NULL,
  endpoint_id text NOT NULL,
  message_id text NOT NULL UNIQUE,
  event text NOT NULL,
  payload text NOT NULL,
  attempt integer NOT NULL DEFAULT 1,
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'delivered', 'failed')),
  next_at timestamptz NOT NULL DEFAULT now(),
  locked_until timestamptz,
  last_result text,
  last_status integer,
  replays integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX webhook_outbox_due_idx ON webhook_outbox (next_at) WHERE state = 'pending';
CREATE INDEX webhook_outbox_workspace_idx ON webhook_outbox (workspace_id, created_at DESC);

-- The JSON ledgers that webhooks kept in settings before omniwebhook.
DELETE FROM settings WHERE key LIKE 'webhooks.incoming.%.deliveries'
  OR key LIKE 'webhooks.outgoing.%.deliveries';
