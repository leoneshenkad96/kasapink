-- Create the Kasapink user table if it has never existed. If the old table
-- exists, preserve its accounts and password hashes while replacing JSON roles.
DO $$ BEGIN
  CREATE TYPE public.erp_user_role AS ENUM ('admin', 'testing');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  IF to_regclass('public.erp_users') IS NULL THEN
    CREATE TABLE public.erp_users (
      id serial PRIMARY KEY,
      username text NOT NULL,
      password_hash text NOT NULL,
      role public.erp_user_role NOT NULL DEFAULT 'testing',
      created_at timestamp with time zone NOT NULL DEFAULT now(),
      updated_at timestamp with time zone NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX erp_users_username_unique ON public.erp_users (username);
  ELSE
    ALTER TABLE public.erp_users
      ADD COLUMN IF NOT EXISTS role public.erp_user_role;

    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'erp_users' AND column_name = 'roles'
    ) THEN
      EXECUTE $sql$
        UPDATE public.erp_users
        SET role = CASE
          WHEN COALESCE(roles::jsonb, '[]'::jsonb) ? 'admin' THEN 'admin'::public.erp_user_role
          ELSE 'testing'::public.erp_user_role
        END
        WHERE role IS NULL
      $sql$;
    ELSE
      UPDATE public.erp_users SET role = 'testing' WHERE role IS NULL;
    END IF;

    UPDATE public.erp_users
    SET role = 'admin'
    WHERE id = (SELECT min(id) FROM public.erp_users)
      AND NOT EXISTS (SELECT 1 FROM public.erp_users WHERE role = 'admin');

    ALTER TABLE public.erp_users ALTER COLUMN role SET DEFAULT 'testing';
    ALTER TABLE public.erp_users ALTER COLUMN role SET NOT NULL;
    ALTER TABLE public.erp_users DROP COLUMN IF EXISTS roles;
    ALTER TABLE public.erp_users DROP COLUMN IF EXISTS permissions;
  END IF;
END $$;
