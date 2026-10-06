-- Adds the operational user role while keeping existing accounts and roles intact.
ALTER TYPE public.erp_user_role ADD VALUE IF NOT EXISTS 'user';
