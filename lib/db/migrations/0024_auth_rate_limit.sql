-- Security Batch 2: shared fixed-window auth throttling for Vercel serverless.
-- Execute separately on Preview and Production before activating the new API.
-- Non-destructive CREATE only; keys are HMAC hashes of origin route + client address.
CREATE TABLE IF NOT EXISTS erp_auth_rate_limit (
  key_hash text NOT NULL,
  window_start bigint NOT NULL,
  hits integer NOT NULL DEFAULT 1,
  PRIMARY KEY (key_hash, window_start)
);
