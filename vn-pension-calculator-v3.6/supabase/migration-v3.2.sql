-- VN Pension Calculator v3.2 - import credit safety
-- Run AFTER migration-v3.1.2.sql in Supabase Dashboard > SQL Editor.
-- Safe to run more than once.

RESET ROLE;

DO $$
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION 'MIGRATION_MUST_RUN_AS_POSTGRES: current_user=%, session_user=%', current_user, session_user
      USING HINT = 'In Supabase SQL Editor, select postgres/default role and run again.';
  END IF;
END $$;

ALTER TABLE public.import_jobs
  ADD COLUMN IF NOT EXISTS credit_consumed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS credit_refunded boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS refund_reason text;

CREATE OR REPLACE FUNCTION public.consume_import_credit_once(
  p_user_id uuid,
  p_job_id uuid,
  p_source_count integer DEFAULT 1
)
RETURNS public.wallets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  j public.import_jobs;
  w public.wallets;
BEGIN
  SELECT * INTO j
  FROM public.import_jobs
  WHERE id = p_job_id AND user_id = p_user_id
  FOR UPDATE;

  IF j.id IS NULL THEN
    RAISE EXCEPTION 'IMPORT_JOB_NOT_FOUND';
  END IF;

  IF j.credit_consumed THEN
    SELECT * INTO w FROM public.wallets WHERE user_id = p_user_id;
    RETURN w;
  END IF;

  UPDATE public.wallets
  SET file_credits = file_credits - 1,
      updated_at = now()
  WHERE user_id = p_user_id AND file_credits > 0
  RETURNING * INTO w;

  IF w.user_id IS NULL THEN
    RAISE EXCEPTION 'NO_CREDIT';
  END IF;

  INSERT INTO public.usage_events(
    user_id, action, direct_delta, file_delta, history_delta, metadata
  ) VALUES (
    p_user_id,
    'file_import_started',
    0,
    -1,
    0,
    jsonb_build_object('jobId', p_job_id, 'sourceCount', greatest(coalesce(p_source_count, 1), 1))
  );

  UPDATE public.import_jobs
  SET credit_consumed = true,
      credit_refunded = false,
      refund_reason = null,
      updated_at = now()
  WHERE id = p_job_id;

  RETURN w;
END;
$$;

CREATE OR REPLACE FUNCTION public.refund_import_credit_once(
  p_user_id uuid,
  p_job_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  j public.import_jobs;
  w public.wallets;
  did_refund boolean := false;
  outcome text := 'not_charged';
BEGIN
  SELECT * INTO j
  FROM public.import_jobs
  WHERE id = p_job_id AND user_id = p_user_id
  FOR UPDATE;

  IF j.id IS NULL THEN
    RAISE EXCEPTION 'IMPORT_JOB_NOT_FOUND';
  END IF;

  IF j.credit_refunded THEN
    outcome := 'already_refunded';
  ELSIF j.credit_consumed THEN
    UPDATE public.wallets
    SET file_credits = file_credits + 1,
        updated_at = now()
    WHERE user_id = p_user_id
    RETURNING * INTO w;

    IF w.user_id IS NULL THEN
      RAISE EXCEPTION 'WALLET_NOT_FOUND';
    END IF;

    INSERT INTO public.usage_events(
      user_id, action, direct_delta, file_delta, history_delta, metadata
    ) VALUES (
      p_user_id,
      'file_import_refund',
      0,
      1,
      0,
      jsonb_build_object(
        'jobId', p_job_id,
        'reason', left(coalesce(p_reason, 'import_failed'), 500)
      )
    );

    UPDATE public.import_jobs
    SET credit_refunded = true,
        refund_reason = left(coalesce(p_reason, 'import_failed'), 500),
        updated_at = now()
    WHERE id = p_job_id;

    did_refund := true;
    outcome := 'refunded';
  END IF;

  IF w.user_id IS NULL THEN
    SELECT * INTO w FROM public.wallets WHERE user_id = p_user_id;
  END IF;

  RETURN jsonb_build_object(
    'refunded', did_refund,
    'outcome', outcome,
    'wallet', to_jsonb(w)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.consume_import_credit_once(uuid,uuid,integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refund_import_credit_once(uuid,uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_import_credit_once(uuid,uuid,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.refund_import_credit_once(uuid,uuid,text) TO service_role;

NOTIFY pgrst, 'reload schema';
