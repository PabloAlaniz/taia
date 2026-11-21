-- One live heartbeat run per agent (see services/agent-run-lease.service.ts).
-- A row is a lease: whoever holds lease_id owns the agent's current run until
-- it releases the lease or expires_at passes, so a run that dies without a
-- word cannot block its agent for longer than its timeout.
CREATE TABLE IF NOT EXISTS agent_run_leases (
  agent_id    text PRIMARY KEY,
  lease_id    text NOT NULL,
  session_key text,
  run_id      text,
  acquired_at timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL
);
