CREATE TABLE IF NOT EXISTS erp_audit_log (
  id serial PRIMARY KEY,
  actor_id integer,
  actor_username text NOT NULL,
  method text NOT NULL,
  path text NOT NULL,
  status_code integer NOT NULL,
  details text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS erp_audit_log_created_at_idx ON erp_audit_log (created_at);
CREATE INDEX IF NOT EXISTS erp_audit_log_actor_idx ON erp_audit_log (actor_id);
