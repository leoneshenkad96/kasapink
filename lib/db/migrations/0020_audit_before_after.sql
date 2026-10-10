ALTER TABLE "erp_audit_log" ADD COLUMN IF NOT EXISTS "before_data" text;
ALTER TABLE "erp_audit_log" ADD COLUMN IF NOT EXISTS "after_data" text;
ALTER TABLE "erp_audit_log" ADD COLUMN IF NOT EXISTS "reason" text;
