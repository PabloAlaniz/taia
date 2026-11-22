-- omnilimit 0.4: rate limit state (omnilimit_state) and its functions, copied
-- verbatim from MIGRATION_SQL in omnilimit/postgres. An omnilimit release that
-- changes MIGRATION_SQL needs a new migration; a unit test checks they match.

-- omnilimit state format 1. Apply once with your migration tool; omnilimit never runs it for you.
CREATE TABLE IF NOT EXISTS omnilimit_state (
  key           text PRIMARY KEY,
  level         bigint NOT NULL,
  ts_ms         bigint NOT NULL,
  expires_at_ms bigint NOT NULL
);

CREATE INDEX IF NOT EXISTS omnilimit_state_expires_idx ON omnilimit_state (expires_at_ms);

CREATE OR REPLACE FUNCTION omnilimit_hit_v1(
  p_key text,
  p_limit bigint,
  p_window_ms bigint,
  p_capacity bigint,
  p_drain_ms bigint,
  p_now_ms bigint DEFAULT NULL
) RETURNS TABLE (allowed boolean, new_level bigint, new_ts bigint)
LANGUAGE plpgsql
AS $$
DECLARE
  v_level bigint;
  v_ts bigint;
  v_now bigint;
  v_t bigint;
  v_drained bigint;
BEGIN
  -- The placeholder (level 0, ts 0) behaves exactly like a missing row.
  INSERT INTO omnilimit_state AS s (key, level, ts_ms, expires_at_ms)
  VALUES (p_key, 0, 0, 0)
  ON CONFLICT (key) DO NOTHING;

  SELECT s.level, s.ts_ms INTO v_level, v_ts
  FROM omnilimit_state AS s
  WHERE s.key = p_key
  FOR UPDATE;

  -- Read the clock after taking the lock: waiters must not act on a stale time.
  v_now := COALESCE(p_now_ms, floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint);
  v_t := GREATEST(v_now, v_ts);
  v_drained := GREATEST(0, v_level - LEAST(v_t - v_ts, p_drain_ms) * p_limit);

  IF v_drained + p_window_ms > p_capacity THEN
    RETURN QUERY SELECT false, v_drained, v_ts;
    RETURN;
  END IF;

  UPDATE omnilimit_state AS s
  SET level = v_drained + p_window_ms,
      ts_ms = v_t,
      expires_at_ms = v_t + p_drain_ms
  WHERE s.key = p_key;

  RETURN QUERY SELECT true, v_drained + p_window_ms, v_t;
END;
$$;

CREATE OR REPLACE FUNCTION omnilimit_cleanup_v1(p_batch integer DEFAULT 1000, p_now_ms bigint DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_deleted integer;
  v_now bigint := COALESCE(p_now_ms, floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint);
BEGIN
  DELETE FROM omnilimit_state
  WHERE key IN (
    SELECT s.key FROM omnilimit_state AS s
    WHERE s.expires_at_ms < v_now
    ORDER BY s.expires_at_ms
    LIMIT p_batch
    FOR UPDATE SKIP LOCKED
  );
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

-- omnilimit state format 1: read-only peek. Apply after 001_v1.sql; it is idempotent.
-- Returns the decision a hit would get now without writing or locking. It is advisory:
-- the hit that follows is still the authority.
CREATE OR REPLACE FUNCTION omnilimit_peek_v1(
  p_key text,
  p_limit bigint,
  p_window_ms bigint,
  p_capacity bigint,
  p_drain_ms bigint,
  p_now_ms bigint DEFAULT NULL
) RETURNS TABLE (allowed boolean, new_level bigint, new_ts bigint)
LANGUAGE plpgsql
AS $$
DECLARE
  v_level bigint := 0;
  v_ts bigint;
  v_now bigint := COALESCE(p_now_ms, floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint);
  v_drained bigint;
BEGIN
  SELECT s.level, s.ts_ms INTO v_level, v_ts
  FROM omnilimit_state AS s
  WHERE s.key = p_key;

  IF NOT FOUND THEN
    v_level := 0;
    v_ts := v_now;
  END IF;

  v_drained := GREATEST(0, v_level - LEAST(GREATEST(v_now, v_ts) - v_ts, p_drain_ms) * p_limit);
  RETURN QUERY SELECT v_drained + p_window_ms <= p_capacity, v_drained, v_ts;
END;
$$;

-- omnilimit state format 1: refund. Apply after 001_v1.sql; it is idempotent.
-- p_window_ms is the reservation's cost times the window, and p_since_ms the ts its hit stored.
-- Gives back what is left of the reservation after draining since then, never below zero.
-- p_capacity is unused: it keeps the arguments of the hit, in the same order.
CREATE OR REPLACE FUNCTION omnilimit_refund_v1(
  p_key text,
  p_limit bigint,
  p_window_ms bigint,
  p_capacity bigint,
  p_drain_ms bigint,
  p_since_ms bigint,
  p_now_ms bigint DEFAULT NULL
) RETURNS TABLE (new_level bigint, new_ts bigint)
LANGUAGE plpgsql
AS $$
DECLARE
  v_level bigint;
  v_ts bigint;
  v_found boolean;
  v_now bigint;
  v_t bigint;
  v_drained bigint;
  v_give bigint := 0;
BEGIN
  SELECT s.level, s.ts_ms INTO v_level, v_ts
  FROM omnilimit_state AS s
  WHERE s.key = p_key
  FOR UPDATE;
  v_found := FOUND;

  -- Read the clock after taking the lock: waiters must not act on a stale time.
  v_now := COALESCE(p_now_ms, floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint);

  IF NOT v_found THEN
    -- The bucket is gone, and the reservation with it.
    RETURN QUERY SELECT 0::bigint, v_now;
    RETURN;
  END IF;

  v_t := GREATEST(v_now, v_ts);
  v_drained := GREATEST(0, v_level - LEAST(v_t - v_ts, p_drain_ms) * p_limit);
  IF v_t >= p_since_ms THEN
    v_give := GREATEST(0, p_window_ms - LEAST(v_t - p_since_ms, p_drain_ms) * p_limit);
  END IF;

  IF v_drained = 0 OR v_give = 0 THEN
    RETURN QUERY SELECT v_drained, v_ts;
    RETURN;
  END IF;

  UPDATE omnilimit_state AS s
  SET level = GREATEST(0, v_drained - v_give),
      ts_ms = v_t,
      expires_at_ms = v_t + p_drain_ms
  WHERE s.key = p_key;

  RETURN QUERY SELECT GREATEST(0, v_drained - v_give), v_t;
END;
$$;
