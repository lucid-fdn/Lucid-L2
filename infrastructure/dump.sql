


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "citext" WITH SCHEMA "public";






CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."email_status" AS ENUM (
    'queued',
    'sent',
    'failed',
    'suppressed'
);


ALTER TYPE "public"."email_status" OWNER TO "postgres";


CREATE TYPE "public"."invite_status" AS ENUM (
    'pending',
    'accepted',
    'revoked',
    'expired'
);


ALTER TYPE "public"."invite_status" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."auto_create_personal_workspace"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_org_id UUID;
  v_slug TEXT;
  v_plan_id UUID;
  v_workspace_name TEXT;
BEGIN
  -- Generate unique slug
  v_slug := 'personal-' || substring(md5(random()::text) from 1 for 8);
  
  -- ✅ FIX: Use name if available, fallback to handle
  -- This gives us "John Doe's Workspace" instead of "user_xyz's Workspace"
  v_workspace_name := COALESCE(NEW.name, NEW.handle, 'User') || '''s Workspace';
  
  -- Create personal organization
  INSERT INTO organizations (
    slug,
    name,
    type,
    created_by,
    created_at,
    updated_at
  ) VALUES (
    v_slug,
    v_workspace_name,  -- ✅ Use the proper name
    'personal',
    NEW.id,
    NOW(),
    NOW()
  )
  RETURNING id INTO v_org_id;
  
  -- Add user as owner
  INSERT INTO organization_members (
    org_id,
    organization_id,
    user_id,
    role,
    created_at,
    joined_at
  ) VALUES (
    v_org_id,
    v_org_id,
    NEW.id,
    'owner',
    NOW(),
    NOW()
  );
  
  -- Get free plan ID
  SELECT id INTO v_plan_id 
  FROM plans 
  WHERE name = 'free' 
  LIMIT 1;
  
  -- Create free subscription (if plans table exists)
  IF v_plan_id IS NOT NULL THEN
    INSERT INTO subscriptions (
      org_id,
      plan_id,
      status,
      billing_period,
      payment_method,
      current_period_start,
      current_period_end,
      created_at,
      updated_at
    ) VALUES (
      v_org_id,
      v_plan_id,
      'active',
      'monthly',
      'stripe_card',
      NOW(),
      NOW() + INTERVAL '100 years',
      NOW(),
      NOW()
    );
  END IF;
  
  RAISE NOTICE 'Auto-created personal workspace % ("%") for user %', v_org_id, v_workspace_name, NEW.id;
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."auto_create_personal_workspace"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."auto_version_workflow"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- Only create version if nodes or edges changed
  IF (NEW.nodes::text IS DISTINCT FROM OLD.nodes::text) OR
     (NEW.edges::text IS DISTINCT FROM OLD.edges::text) THEN
    
    PERFORM create_workflow_version(
      NEW.id,
      NEW.user_id,
      true,  -- is_auto_save
      'Auto-saved version'
    );
  END IF;
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."auto_version_workflow"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."calculate_next_run"("cron_expr" "text", "tz" "text" DEFAULT 'UTC'::"text", "from_time" timestamp with time zone DEFAULT "now"()) RETURNS timestamp with time zone
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  next_run TIMESTAMPTZ;
BEGIN
  -- This is a placeholder - in production, use pg_cron or external service
  -- For now, return next hour as fallback
  next_run := date_trunc('hour', from_time) + interval '1 hour';
  RETURN next_run;
END;
$$;


ALTER FUNCTION "public"."calculate_next_run"("cron_expr" "text", "tz" "text", "from_time" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_single_personal_workspace"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_org_type TEXT;
  v_existing_count INTEGER;
BEGIN
  -- Only check for owner role
  IF NEW.role <> 'owner' THEN
    RETURN NEW;
  END IF;
  
  -- Get organization type
  SELECT type INTO v_org_type
  FROM organizations
  WHERE id = NEW.organization_id;
  
  -- Only check for personal workspaces
  IF v_org_type <> 'personal' THEN
    RETURN NEW;
  END IF;
  
  -- Check if user already owns another personal workspace
  SELECT COUNT(*) INTO v_existing_count
  FROM organization_members om
  JOIN organizations o ON o.id = om.organization_id
  WHERE om.user_id = NEW.user_id
    AND om.role = 'owner'
    AND o.type = 'personal'
    AND om.organization_id != NEW.organization_id;  -- Exclude current org for updates
  
  IF v_existing_count > 0 THEN
    RAISE EXCEPTION 'User already has a personal workspace. Each user can only have one personal workspace.';
  END IF;
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."check_single_personal_workspace"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_usage_limit"("p_org_id" "uuid", "p_metric_name" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_subscription RECORD;
  v_limit INTEGER;
  v_current_usage INTEGER;
BEGIN
  -- Get subscription and limit
  SELECT * INTO v_subscription
  FROM get_org_subscription(p_org_id);
  
  IF NOT FOUND THEN
    RETURN false; -- No subscription = free tier = blocked
  END IF;
  
  -- Get limit from plan
  v_limit := (v_subscription.limits ->> p_metric_name)::INTEGER;
  
  -- -1 means unlimited
  IF v_limit = -1 THEN
    RETURN true;
  END IF;
  
  -- Get current usage
  v_current_usage := get_current_usage(p_org_id, p_metric_name);
  
  -- Check if under limit
  RETURN v_current_usage < v_limit;
END;
$$;


ALTER FUNCTION "public"."check_usage_limit"("p_org_id" "uuid", "p_metric_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_old_ai_generations"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- Delete records older than 90 days
  DELETE FROM ai_workflow_generations
  WHERE created_at < NOW() - INTERVAL '90 days';
END;
$$;


ALTER FUNCTION "public"."cleanup_old_ai_generations"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."cleanup_old_ai_generations"() IS 'Deletes AI generation records older than 90 days to manage storage';



CREATE OR REPLACE FUNCTION "public"."cleanup_old_executions"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM workflow_executions
  WHERE started_at < (now() - INTERVAL '30 days')
    AND status IN ('success', 'error', 'cancelled');
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;


ALTER FUNCTION "public"."cleanup_old_executions"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_default_notification_prefs"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    INSERT INTO notification_preferences (user_id)
    VALUES (NEW.id)
    ON CONFLICT (user_id) DO NOTHING;
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."create_default_notification_prefs"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_default_project_and_env"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    new_project_id UUID;
BEGIN
    INSERT INTO projects (org_id, name, slug, is_default, created_by)
    VALUES (NEW.id, 'Default Project', 'default', true, NEW.created_by)
    RETURNING id INTO new_project_id;
    
    INSERT INTO environments (project_id, name, is_default, created_by)
    VALUES (new_project_id, 'production', true, NEW.created_by);
    
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."create_default_project_and_env"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_workflow_version"("p_workflow_id" "uuid", "p_created_by" "uuid", "p_is_auto_save" boolean DEFAULT false, "p_change_summary" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_version_id UUID;
  v_version_number INTEGER;
  v_workflow RECORD;
BEGIN
  -- Get current workflow state
  SELECT * INTO v_workflow
  FROM workflows
  WHERE id = p_workflow_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Workflow not found';
  END IF;
  
  -- Get next version number
  v_version_number := get_next_version_number(p_workflow_id);
  
  -- Create version
  INSERT INTO workflow_versions (
    workflow_id,
    version_number,
    name,
    description,
    nodes,
    edges,
    pin_data,
    settings,
    created_by,
    is_auto_save,
    change_summary
  )
  VALUES (
    p_workflow_id,
    v_version_number,
    v_workflow.name,
    v_workflow.description,
    v_workflow.nodes,
    v_workflow.edges,
    v_workflow.pin_data,
    v_workflow.settings,
    p_created_by,
    p_is_auto_save,
    p_change_summary
  )
  RETURNING id INTO v_version_id;
  
  RETURN v_version_id;
END;
$$;


ALTER FUNCTION "public"."create_workflow_version"("p_workflow_id" "uuid", "p_created_by" "uuid", "p_is_auto_save" boolean, "p_change_summary" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."create_workflow_version"("p_workflow_id" "uuid", "p_created_by" "uuid", "p_is_auto_save" boolean, "p_change_summary" "text") IS 'Creates a new version snapshot of a workflow';



CREATE OR REPLACE FUNCTION "public"."generate_webhook_api_key"() RETURNS "text"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- Generate secure 32-character API key
  RETURN 'whk_' || encode(gen_random_bytes(24), 'base64');
END;
$$;


ALTER FUNCTION "public"."generate_webhook_api_key"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_webhook_path"() RETURNS "text"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  new_path TEXT;
  path_exists BOOLEAN;
BEGIN
  LOOP
    -- Generate random 16-character alphanumeric string
    new_path := lower(substring(md5(random()::text || clock_timestamp()::text) from 1 for 16));
    
    -- Check if path already exists
    SELECT EXISTS(SELECT 1 FROM workflow_webhooks WHERE path = new_path) INTO path_exists;
    
    -- Exit loop if path is unique
    EXIT WHEN NOT path_exists;
  END LOOP;
  
  RETURN new_path;
END;
$$;


ALTER FUNCTION "public"."generate_webhook_path"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_current_usage"("p_org_id" "uuid", "p_metric_name" "text") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_usage INTEGER;
  v_period_start TIMESTAMPTZ;
  v_period_end TIMESTAMPTZ;
BEGIN
  -- Calculate current month period
  v_period_start := date_trunc('month', NOW());
  v_period_end := date_trunc('month', NOW()) + INTERVAL '1 month' - INTERVAL '1 second';
  
  SELECT COALESCE(metric_value, 0)
  INTO v_usage
  FROM usage_metrics
  WHERE org_id = p_org_id
    AND metric_name = p_metric_name
    AND period_start = v_period_start
    AND period_end >= v_period_end;
  
  RETURN COALESCE(v_usage, 0);
END;
$$;


ALTER FUNCTION "public"."get_current_usage"("p_org_id" "uuid", "p_metric_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_current_workspace"("p_user_id" "uuid", "p_org_id" "uuid") RETURNS TABLE("org_id" "uuid", "project_id" "uuid", "env_id" "uuid", "org_name" "text", "project_name" "text", "env_name" "text", "user_role" "text")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        o.id as org_id,
        p.id as project_id,
        e.id as env_id,
        o.name as org_name,
        p.name as project_name,
        e.name as env_name,
        om.role::TEXT as user_role  -- ✅ ADD: Include user's role
    FROM organizations o
    JOIN organization_members om ON o.id = om.organization_id
    JOIN projects_active p ON o.id = p.org_id AND p.is_default = true
    JOIN environments_active e ON p.id = e.project_id AND e.is_default = true
    WHERE om.user_id = p_user_id
      AND o.id = p_org_id;
END;
$$;


ALTER FUNCTION "public"."get_current_workspace"("p_user_id" "uuid", "p_org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_default_env_id"("project_uuid" "uuid") RETURNS "uuid"
    LANGUAGE "sql" STABLE
    AS $$
    SELECT id FROM environments_active 
    WHERE project_id = project_uuid 
      AND is_default = true 
    LIMIT 1;
$$;


ALTER FUNCTION "public"."get_default_env_id"("project_uuid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_default_project_id"("org_uuid" "uuid") RETURNS "uuid"
    LANGUAGE "sql" STABLE
    AS $$
    SELECT id FROM projects_active 
    WHERE org_id = org_uuid 
      AND is_default = true 
    LIMIT 1;
$$;


ALTER FUNCTION "public"."get_default_project_id"("org_uuid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_invite_details"("p_token" "uuid") RETURNS TABLE("invite_id" "uuid", "org_id" "uuid", "org_name" "text", "org_slug" "text", "role" "text", "status" "public"."invite_status", "expires_at" timestamp with time zone, "inviter_name" "text")
    LANGUAGE "plpgsql" STABLE
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        i.id,
        i.org_id,
        o.name,
        o.slug,
        i.role,
        i.status,
        i.expires_at,
        p.name as inviter_name
    FROM org_invites i
    JOIN organizations o ON i.org_id = o.id
    LEFT JOIN profiles p ON i.inviter_id = p.id
    WHERE i.token = p_token;
END;
$$;


ALTER FUNCTION "public"."get_invite_details"("p_token" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_next_version_number"("p_workflow_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_max_version INTEGER;
BEGIN
  SELECT COALESCE(MAX(version_number), 0) + 1
  INTO v_max_version
  FROM workflow_versions
  WHERE workflow_id = p_workflow_id;
  
  RETURN v_max_version;
END;
$$;


ALTER FUNCTION "public"."get_next_version_number"("p_workflow_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_org_subscription"("p_org_id" "uuid") RETURNS TABLE("subscription_id" "uuid", "org_id" "uuid", "plan_id" "uuid", "plan_name" "text", "plan_display_name" "text", "status" "text", "billing_period" "text", "payment_method" "text", "current_period_start" timestamp with time zone, "current_period_end" timestamp with time zone, "features" "jsonb", "limits" "jsonb")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    s.id as subscription_id,
    s.org_id,
    s.plan_id,
    p.name as plan_name,
    p.display_name as plan_display_name,
    s.status,
    s.billing_period,
    s.payment_method,
    s.current_period_start,
    s.current_period_end,
    p.features,
    p.limits
  FROM subscriptions s
  JOIN plans p ON s.plan_id = p.id
  WHERE s.org_id = p_org_id
    AND s.status = 'active'
  LIMIT 1;
END;
$$;


ALTER FUNCTION "public"."get_org_subscription"("p_org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_session_var"("var_name" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" STABLE
    AS $$
DECLARE
    var_value TEXT;
BEGIN
    var_value := current_setting('app.' || var_name, true);
    
    IF var_value IS NULL OR var_value = '' THEN
        RAISE EXCEPTION 'Session variable app.% is not set. Call set_workspace_scope() first.', var_name;
    END IF;
    
    RETURN var_value::uuid;
END;
$$;


ALTER FUNCTION "public"."get_session_var"("var_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_favorites"("p_user_id" "uuid", "p_org_id" "uuid") RETURNS TABLE("id" "uuid", "favoritable_type" "text", "favoritable_id" "uuid", "sort_order" integer, "name" "text", "url" "text", "icon" "text", "created_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    f.id,
    f.favoritable_type,
    f.favoritable_id,
    f.sort_order,
    f.name,
    f.url,
    f.icon,
    f.created_at
  FROM favorites f
  WHERE f.user_id = p_user_id 
    AND f.org_id = p_org_id
  ORDER BY f.sort_order ASC, f.created_at ASC;
END;
$$;


ALTER FUNCTION "public"."get_user_favorites"("p_user_id" "uuid", "p_org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_preferences"("p_user_id" "uuid") RETURNS TABLE("user_id" "uuid", "sidebar_collapsed" boolean, "theme" "text", "language" "text", "compact_mode" boolean, "show_onboarding" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- Try to get existing preferences
  RETURN QUERY
  SELECT 
    up.user_id,
    up.sidebar_collapsed,
    up.theme,
    up.language,
    up.compact_mode,
    up.show_onboarding
  FROM user_preferences up
  WHERE up.user_id = p_user_id;
  
  -- If no preferences exist, return defaults
  IF NOT FOUND THEN
    RETURN QUERY
    SELECT 
      p_user_id,
      false::BOOLEAN,  -- sidebar_collapsed default
      'system'::TEXT,   -- theme default
      'en'::TEXT,       -- language default
      false::BOOLEAN,  -- compact_mode default
      true::BOOLEAN    -- show_onboarding default
    ;
  END IF;
END;
$$;


ALTER FUNCTION "public"."get_user_preferences"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_workspace"("p_user_id" "uuid") RETURNS TABLE("org_id" "uuid", "org_name" "text", "project_id" "uuid", "project_name" "text", "env_id" "uuid", "env_name" "text")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        o.id,
        o.name,
        p.id,
        p.name,
        e.id,
        e.name
    FROM organizations o
    JOIN organization_members om ON o.id = om.organization_id
    JOIN projects_active p ON o.id = p.org_id AND p.is_default = true
    JOIN environments_active e ON p.id = e.project_id AND e.is_default = true
    WHERE om.user_id = p_user_id
    ORDER BY om.joined_at DESC
    LIMIT 1;
END;
$$;


ALTER FUNCTION "public"."get_user_workspace"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_workflow_stats"("workflow_uuid" "uuid") RETURNS TABLE("workflow_id" "uuid", "execution_count" bigint, "success_count" bigint, "error_count" bigint, "last_execution_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    w.id as workflow_id,
    COUNT(we.id) as execution_count,
    COUNT(CASE WHEN we.status = 'success' THEN 1 END) as success_count,
    COUNT(CASE WHEN we.status = 'error' THEN 1 END) as error_count,
    MAX(we.started_at) as last_execution_at
  FROM workflows w
  LEFT JOIN workflow_executions we ON we.workflow_id = w.id
  WHERE w.id = workflow_uuid
  GROUP BY w.id;
END;
$$;


ALTER FUNCTION "public"."get_workflow_stats"("workflow_uuid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_exists"("handle_to_check" "public"."citext") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  return exists (
    select 1 from public.profiles where handle = handle_to_check
  );
end;
$$;


ALTER FUNCTION "public"."handle_exists"("handle_to_check" "public"."citext") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_usage_metric"("p_org_id" "uuid", "p_metric_name" "text", "p_amount" integer, "p_period_start" timestamp with time zone, "p_period_end" timestamp with time zone) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  INSERT INTO usage_metrics (
    org_id,
    metric_name,
    metric_value,
    period_start,
    period_end
  ) VALUES (
    p_org_id,
    p_metric_name,
    p_amount,
    p_period_start,
    p_period_end
  )
  ON CONFLICT (org_id, metric_name, period_start, period_end)
  DO UPDATE SET
    metric_value = usage_metrics.metric_value + p_amount;
END;
$$;


ALTER FUNCTION "public"."increment_usage_metric"("p_org_id" "uuid", "p_metric_name" "text", "p_amount" integer, "p_period_start" timestamp with time zone, "p_period_end" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_expired_invites"() RETURNS integer
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    expired_count INTEGER;
BEGIN
    UPDATE org_invites
    SET status = 'expired'
    WHERE status = 'pending'
      AND expires_at < NOW()
    RETURNING COUNT(*) INTO expired_count;
    
    RETURN expired_count;
END;
$$;


ALTER FUNCTION "public"."mark_expired_invites"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_project_deletion_with_resources"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    active_agents_count INT;
BEGIN
    -- Only check on UPDATE when setting deleted_at
    IF TG_OP = 'UPDATE' AND OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
        -- Count active resources (add more tables as needed)
        SELECT COUNT(*) INTO active_agents_count
        FROM agents
        WHERE project_id = NEW.id AND deleted_at IS NULL;
        
        IF active_agents_count > 0 THEN
            RAISE EXCEPTION 'Cannot delete project with % active agents. Soft-delete resources first.', active_agents_count;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."prevent_project_deletion_with_resources"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reorder_favorites"("p_user_id" "uuid", "p_org_id" "uuid", "p_favorite_ids" "uuid"[]) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_sort_order INTEGER := 0;
  v_favorite_id UUID;
BEGIN
  -- Update sort_order for each favorite in the new order
  FOREACH v_favorite_id IN ARRAY p_favorite_ids
  LOOP
    UPDATE favorites
    SET sort_order = v_sort_order,
        updated_at = NOW()
    WHERE id = v_favorite_id
      AND user_id = p_user_id
      AND org_id = p_org_id;
    
    v_sort_order := v_sort_order + 1;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."reorder_favorites"("p_user_id" "uuid", "p_org_id" "uuid", "p_favorite_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."restore_workflow_version"("p_workflow_id" "uuid", "p_version_id" "uuid", "p_restored_by" "uuid") RETURNS boolean
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_version RECORD;
BEGIN
  -- Get version data
  SELECT * INTO v_version
  FROM workflow_versions
  WHERE id = p_version_id
  AND workflow_id = p_workflow_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Version not found';
  END IF;
  
  -- Update workflow with version data
  UPDATE workflows
  SET
    nodes = v_version.nodes,
    edges = v_version.edges,
    pin_data = v_version.pin_data,
    settings = v_version.settings,
    updated_at = now()
  WHERE id = p_workflow_id;
  
  -- Create new version marking the restore
  PERFORM create_workflow_version(
    p_workflow_id,
    p_restored_by,
    false,
    'Restored from version ' || v_version.version_number
  );
  
  RETURN true;
END;
$$;


ALTER FUNCTION "public"."restore_workflow_version"("p_workflow_id" "uuid", "p_version_id" "uuid", "p_restored_by" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."restore_workflow_version"("p_workflow_id" "uuid", "p_version_id" "uuid", "p_restored_by" "uuid") IS 'Restores a workflow to a previous version';



CREATE OR REPLACE FUNCTION "public"."set_workspace_scope"("p_org_id" "uuid", "p_project_id" "uuid", "p_env_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    -- Transaction-local (is_local=true) for connection pooler safety
    PERFORM set_config('app.org', p_org_id::text, true);
    PERFORM set_config('app.project', p_project_id::text, true);
    PERFORM set_config('app.env', p_env_id::text, true);
    
    RAISE NOTICE 'Workspace scope set: org=%, project=%, env=%', p_org_id, p_project_id, p_env_id;
END;
$$;


ALTER FUNCTION "public"."set_workspace_scope"("p_org_id" "uuid", "p_project_id" "uuid", "p_env_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_org_id_columns"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    -- Keep both columns in sync
    IF NEW.org_id IS NOT NULL THEN
        NEW.organization_id := NEW.org_id;
    ELSIF NEW.organization_id IS NOT NULL THEN
        NEW.org_id := NEW.organization_id;
    END IF;
    
    -- Keep timestamps in sync
    IF NEW.created_at IS NOT NULL THEN
        NEW.joined_at := NEW.created_at;
    ELSIF NEW.joined_at IS NOT NULL THEN
        NEW.created_at := NEW.joined_at;
    END IF;
    
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sync_org_id_columns"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_credentials_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_credentials_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_invite_token_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_invite_token_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_newsletter_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_newsletter_updated_at_column"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_node_execution_data_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_node_execution_data_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_schedule_next_run"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.enabled = true THEN
    NEW.next_run_at := calculate_next_run(
      NEW.cron_expression,
      NEW.timezone,
      COALESCE(NEW.last_run_at, now())
    );
  ELSE
    NEW.next_run_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_schedule_next_run"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_schedule_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_schedule_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_variable_is_secret"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.type = 'secret' THEN
    NEW.is_secret = true;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_variable_is_secret"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_variable_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_variable_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_webhook_timestamp"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_webhook_timestamp"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_workflows_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_workflows_updated_at"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."agents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "project_id" "uuid" NOT NULL,
    "env_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "description" "text",
    "persona" "jsonb" DEFAULT '{}'::"jsonb",
    "tools" "jsonb" DEFAULT '[]'::"jsonb",
    "router_mode" "text" DEFAULT 'auto'::"text",
    "memory_scope_id" "uuid",
    "policy_pack_id" "uuid",
    "schedule_json" "jsonb",
    "config" "jsonb" DEFAULT '{}'::"jsonb",
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "updated_by" "uuid",
    "deleted_at" timestamp with time zone,
    CONSTRAINT "agents_router_mode_check" CHECK (("router_mode" = ANY (ARRAY['pinned'::"text", 'assist'::"text", 'auto'::"text"])))
);


ALTER TABLE "public"."agents" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."agents_active" AS
 SELECT "id",
    "org_id",
    "project_id",
    "env_id",
    "name",
    "slug",
    "description",
    "persona",
    "tools",
    "router_mode",
    "memory_scope_id",
    "policy_pack_id",
    "schedule_json",
    "config",
    "is_active",
    "created_at",
    "updated_at",
    "created_by",
    "updated_by",
    "deleted_at"
   FROM "public"."agents"
  WHERE ("deleted_at" IS NULL);


ALTER VIEW "public"."agents_active" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_workflow_generations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "prompt" "text" NOT NULL,
    "success" boolean DEFAULT false NOT NULL,
    "tokens_used" integer,
    "error_message" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."ai_workflow_generations" OWNER TO "postgres";


COMMENT ON TABLE "public"."ai_workflow_generations" IS 'Tracks AI workflow generation requests for rate limiting, analytics, and billing';



COMMENT ON COLUMN "public"."ai_workflow_generations"."user_id" IS 'User who requested the AI generation';



COMMENT ON COLUMN "public"."ai_workflow_generations"."prompt" IS 'Natural language prompt provided by user';



COMMENT ON COLUMN "public"."ai_workflow_generations"."success" IS 'Whether the generation was successful';



COMMENT ON COLUMN "public"."ai_workflow_generations"."tokens_used" IS 'GPT-4 tokens used (for billing and cost tracking)';



COMMENT ON COLUMN "public"."ai_workflow_generations"."error_message" IS 'Error message if generation failed';



CREATE TABLE IF NOT EXISTS "public"."app_agents" (
    "app_id" "uuid" NOT NULL,
    "agent_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'primary'::"text",
    "order_index" integer DEFAULT 0,
    "config" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "app_agents_role_check" CHECK (("role" = ANY (ARRAY['primary'::"text", 'helper'::"text", 'qa'::"text"])))
);


ALTER TABLE "public"."app_agents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."apps" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "project_id" "uuid" NOT NULL,
    "env_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "description" "text",
    "surfaces" "jsonb" DEFAULT '["web"]'::"jsonb",
    "auth_mode" "text" DEFAULT 'org'::"text",
    "entry_route" "text",
    "pricing_plan_id" "uuid",
    "config" "jsonb" DEFAULT '{}'::"jsonb",
    "is_public" boolean DEFAULT false,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "updated_by" "uuid",
    "deleted_at" timestamp with time zone,
    CONSTRAINT "apps_auth_mode_check" CHECK (("auth_mode" = ANY (ARRAY['org'::"text", 'end_user'::"text"])))
);


ALTER TABLE "public"."apps" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."asset_categories" (
    "asset_id" "uuid" NOT NULL,
    "category_id" "uuid" NOT NULL
);


ALTER TABLE "public"."asset_categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."asset_likes" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "asset_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."asset_likes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."assets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "external_id" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "kind" "text" NOT NULL,
    "owner_org_id" "uuid",
    "owner_user_id" "uuid",
    "name" "text" NOT NULL,
    "version" "text" DEFAULT 'v0.1'::"text" NOT NULL,
    "summary" "text",
    "tags" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "license" "text",
    "visibility" "text" DEFAULT 'PUBLIC'::"text" NOT NULL,
    "eu_only" boolean DEFAULT false NOT NULL,
    "cc_on" boolean DEFAULT false NOT NULL,
    "p95_ms" integer,
    "reliability" numeric(5,2),
    "cost_per_tok" numeric(12,10),
    "proven_runs" integer DEFAULT 0 NOT NULL,
    "rating" numeric(3,2),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "assets_kind_check" CHECK (("kind" = ANY (ARRAY['MODEL'::"text", 'DATASET'::"text", 'AGENT'::"text", 'COMPUTE'::"text"]))),
    CONSTRAINT "assets_visibility_check" CHECK (("visibility" = ANY (ARRAY['PUBLIC'::"text", 'UNLISTED'::"text", 'PRIVATE'::"text"])))
);


ALTER TABLE "public"."assets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."bookmarks" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "asset_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."bookmarks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slug" "text" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."contacts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "first_name" character varying(255),
    "last_name" character varying(255),
    "email" character varying(255) NOT NULL,
    "phone_number" character varying(50),
    "company" character varying(255),
    "role" character varying(255),
    "company_size" character varying(100),
    "use_case" "text",
    "timeline" character varying(100),
    "budget" character varying(100),
    "partnership_type" character varying(100),
    "priority" character varying(50),
    "description" "text",
    "message" "text",
    "solana_wallet" character varying(255),
    "discord_id" character varying(255),
    "twitter_id" character varying(255),
    "source" character varying(255),
    "form_type" character varying(255),
    "agree_to_policies" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."contacts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."contributor_follows" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "follower_id" "uuid" NOT NULL,
    "following_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "no_self_follow" CHECK (("follower_id" <> "following_id"))
);


ALTER TABLE "public"."contributor_follows" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."credential_usage" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "credential_id" "uuid" NOT NULL,
    "workflow_id" "uuid" NOT NULL,
    "node_id" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."credential_usage" OWNER TO "postgres";


COMMENT ON TABLE "public"."credential_usage" IS 'Tracks which workflows use which credentials';



CREATE TABLE IF NOT EXISTS "public"."credentials" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "organization_id" "uuid",
    "name" "text" NOT NULL,
    "type" "text" NOT NULL,
    "data" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    CONSTRAINT "credentials_type_check" CHECK (("type" = ANY (ARRAY['api_key'::"text", 'basic_auth'::"text", 'oauth2'::"text", 'custom_headers'::"text"])))
);


ALTER TABLE "public"."credentials" OWNER TO "postgres";


COMMENT ON TABLE "public"."credentials" IS 'Stores encrypted credentials for workflows';



COMMENT ON COLUMN "public"."credentials"."data" IS 'Encrypted JSON containing credential details';



CREATE TABLE IF NOT EXISTS "public"."email_suppressions" (
    "address" "text" NOT NULL,
    "reason" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."email_suppressions" OWNER TO "postgres";


COMMENT ON TABLE "public"."email_suppressions" IS 'Suppressed email addresses (bounces, complaints, manual blocks)';



CREATE TABLE IF NOT EXISTS "public"."emails" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "type" "text" NOT NULL,
    "to_address" "text" NOT NULL,
    "subject" "text",
    "provider_id" "text",
    "status" "public"."email_status" DEFAULT 'queued'::"public"."email_status" NOT NULL,
    "error" "text",
    "dedupe_key" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "sent_at" timestamp with time zone
);


ALTER TABLE "public"."emails" OWNER TO "postgres";


COMMENT ON TABLE "public"."emails" IS 'Email delivery log - tracks all sent emails';



COMMENT ON COLUMN "public"."emails"."provider_id" IS 'External provider message ID (Resend, SES, etc.)';



COMMENT ON COLUMN "public"."emails"."dedupe_key" IS 'Unique key to prevent duplicate sends (e.g., invite:orgid:email)';



CREATE TABLE IF NOT EXISTS "public"."environments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "is_default" boolean DEFAULT false NOT NULL,
    "config" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "updated_by" "uuid",
    "deleted_at" timestamp with time zone,
    CONSTRAINT "environments_name_check" CHECK (("name" = ANY (ARRAY['production'::"text", 'staging'::"text", 'development'::"text"])))
);


ALTER TABLE "public"."environments" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."environments_active" AS
 SELECT "id",
    "project_id",
    "name",
    "is_default",
    "config",
    "created_at",
    "updated_at",
    "created_by",
    "updated_by",
    "deleted_at"
   FROM "public"."environments"
  WHERE ("deleted_at" IS NULL);


ALTER VIEW "public"."environments_active" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."favorites" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "org_id" "uuid" NOT NULL,
    "favoritable_type" "text" NOT NULL,
    "favoritable_id" "uuid" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "name" "text" NOT NULL,
    "url" "text" NOT NULL,
    "icon" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "favorites_favoritable_type_check" CHECK (("favoritable_type" = ANY (ARRAY['project'::"text", 'agent'::"text", 'app'::"text", 'page'::"text", 'data_source'::"text"])))
);


ALTER TABLE "public"."favorites" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."identity_links" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "provider" "text" NOT NULL,
    "external_id" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."identity_links" OWNER TO "postgres";


COMMENT ON TABLE "public"."identity_links" IS 'Maps external auth provider IDs to internal user IDs';



COMMENT ON COLUMN "public"."identity_links"."provider" IS 'Auth provider name (privy, auth0, clerk, etc.)';



COMMENT ON COLUMN "public"."identity_links"."external_id" IS 'Provider-specific user ID';



CREATE TABLE IF NOT EXISTS "public"."invite_tokens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "token" "text" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "enabled" boolean DEFAULT true NOT NULL,
    "expires_at" timestamp with time zone,
    "used_count" integer DEFAULT 0 NOT NULL,
    "max_uses" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."invite_tokens" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."newsletter_subscribers" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "email" "text" NOT NULL,
    "subscribed_at" timestamp with time zone DEFAULT "now"(),
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."newsletter_subscribers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."node_execution_data" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "execution_id" "uuid" NOT NULL,
    "node_name" "text" NOT NULL,
    "node_type" "text" NOT NULL,
    "status" "text" DEFAULT 'waiting'::"text",
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "duration_ms" integer,
    "input_data" "jsonb",
    "output_data" "jsonb",
    "error" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "node_execution_data_status_check" CHECK (("status" = ANY (ARRAY['waiting'::"text", 'running'::"text", 'success'::"text", 'error'::"text"])))
);


ALTER TABLE "public"."node_execution_data" OWNER TO "postgres";


COMMENT ON TABLE "public"."node_execution_data" IS 'Stores real-time node execution data for live updates';



CREATE TABLE IF NOT EXISTS "public"."notification_preferences" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "posts_email" boolean DEFAULT true,
    "posts_web" boolean DEFAULT true,
    "watched_activity_email" boolean DEFAULT true,
    "watched_activity_web" boolean DEFAULT true,
    "features_announcements" boolean DEFAULT true,
    "org_join_requests" boolean DEFAULT true,
    "org_suggestions" boolean DEFAULT false,
    "new_followers" boolean DEFAULT true,
    "gated_repo_requests" boolean DEFAULT true,
    "billing_notifications" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "channel_web" boolean DEFAULT true,
    "channel_email" boolean DEFAULT true,
    "follow_web" boolean DEFAULT true,
    "follow_email" boolean DEFAULT true,
    "interactions_web" boolean DEFAULT true,
    "interactions_email" boolean DEFAULT false
);


ALTER TABLE "public"."notification_preferences" OWNER TO "postgres";


COMMENT ON TABLE "public"."notification_preferences" IS 'User notification preferences using channel-based system';



COMMENT ON COLUMN "public"."notification_preferences"."user_id" IS 'References profiles.id';



COMMENT ON COLUMN "public"."notification_preferences"."updated_at" IS 'Timestamp of last update';



COMMENT ON COLUMN "public"."notification_preferences"."channel_web" IS 'Master toggle for all web (toast) notifications';



COMMENT ON COLUMN "public"."notification_preferences"."channel_email" IS 'Master toggle for all email notifications';



COMMENT ON COLUMN "public"."notification_preferences"."follow_web" IS 'Web notifications for new followers';



COMMENT ON COLUMN "public"."notification_preferences"."follow_email" IS 'Email notifications for new followers';



COMMENT ON COLUMN "public"."notification_preferences"."interactions_web" IS 'Web notifications for asset interactions (ratings, bookmarks)';



COMMENT ON COLUMN "public"."notification_preferences"."interactions_email" IS 'Email notifications for asset interactions';



CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "message" "text",
    "type" "text" NOT NULL,
    "href" "text",
    "read" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "organization_id" "uuid",
    "severity" "text",
    CONSTRAINT "notifications_severity_check" CHECK (("severity" = ANY (ARRAY['info'::"text", 'success'::"text", 'warning'::"text", 'error'::"text"]))),
    CONSTRAINT "notifications_type_check" CHECK (("type" = ANY (ARRAY['info'::"text", 'success'::"text", 'warning'::"text", 'error'::"text"])))
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


COMMENT ON TABLE "public"."notifications" IS 'Notification inbox/history for users. 
organization_id NULL = global notification (shows in all orgs)
organization_id set = org-specific notification (shows only in that org context)';



COMMENT ON COLUMN "public"."notifications"."organization_id" IS 'Optional org context - NULL = global notification';



COMMENT ON COLUMN "public"."notifications"."severity" IS 'UI severity level: info, success, warning, error. Auto-computed from notification type.';



CREATE TABLE IF NOT EXISTS "public"."org_follows" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "org_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."org_follows" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."org_invites" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "email" "text",
    "role" "text" NOT NULL,
    "token" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "expires_at" timestamp with time zone DEFAULT ("now"() + '7 days'::interval) NOT NULL,
    "inviter_id" "uuid" NOT NULL,
    "accepted_user_id" "uuid",
    "accepted_at" timestamp with time zone,
    "revoked_at" timestamp with time zone,
    "status" "public"."invite_status" DEFAULT 'pending'::"public"."invite_status" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "email_format" CHECK ((("email" IS NULL) OR (POSITION(('@'::"text") IN ("email")) > 1))),
    CONSTRAINT "org_invites_role_check" CHECK (("role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'member'::"text", 'guest'::"text"])))
);


ALTER TABLE "public"."org_invites" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organization_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'member'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "organization_id" "uuid",
    "joined_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."organization_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organizations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slug" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid",
    "display_name" "text",
    "name" "text",
    "legal_name" "text",
    "type" "text" DEFAULT 'company'::"text",
    "logo_url" "text",
    "banner_url" "text",
    "bio" "text",
    "website_url" "text",
    "homepage" "text",
    "location" "text",
    "interests" "text"[],
    "socials" "jsonb" DEFAULT '{}'::"jsonb",
    "github_username" "text",
    "twitter_username" "text",
    "linkedin_url" "text",
    "verified" boolean DEFAULT false,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "workspace_public" boolean DEFAULT true
);


ALTER TABLE "public"."organizations" OWNER TO "postgres";


COMMENT ON COLUMN "public"."organizations"."type" IS 'Type of organization: ''personal'' (one per user) or ''team'' (unlimited). Personal workspaces are auto-created.';



COMMENT ON COLUMN "public"."organizations"."metadata" IS 'Flexible JSONB storage for onboarding data, analytics, and custom fields';



CREATE TABLE IF NOT EXISTS "public"."payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "subscription_id" "uuid" NOT NULL,
    "org_id" "uuid" NOT NULL,
    "amount" integer NOT NULL,
    "currency" "text" DEFAULT 'usd'::"text" NOT NULL,
    "payment_method" "text" NOT NULL,
    "status" "text" NOT NULL,
    "provider" "text" NOT NULL,
    "provider_payment_id" "text" NOT NULL,
    "provider_customer_id" "text",
    "transaction_hash" "text",
    "block_number" bigint,
    "wallet_address" "text",
    "confirmations" integer,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "payments_provider_check" CHECK (("provider" = ANY (ARRAY['stripe'::"text", 'coinbase'::"text"]))),
    CONSTRAINT "payments_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'succeeded'::"text", 'failed'::"text", 'refunded'::"text"])))
);


ALTER TABLE "public"."payments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."plans" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "display_name" "text" NOT NULL,
    "description" "text",
    "price_monthly_usd" integer,
    "price_yearly_usd" integer,
    "price_monthly_crypto" "text",
    "price_yearly_crypto" "text",
    "features" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "limits" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "stripe_product_id" "text",
    "stripe_price_monthly_id" "text",
    "stripe_price_yearly_id" "text",
    "coinbase_product_id" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "is_featured" boolean DEFAULT false NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "plans_name_check" CHECK (("name" = ANY (ARRAY['free'::"text", 'pro'::"text", 'enterprise'::"text"])))
);


ALTER TABLE "public"."plans" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "handle" "text",
    "email" "text",
    "name" "text",
    "avatar_url" "text",
    "bio" "text",
    "homepage" "text",
    "interests" "text"[],
    "github_username" "text",
    "twitter_username" "text",
    "linkedin_url" "text",
    "profile_public" boolean DEFAULT true,
    "onboarding_completed" boolean DEFAULT false,
    "last_login_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "first_name" "text",
    "last_name" "text"
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."projects" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "description" "text",
    "is_default" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "updated_by" "uuid",
    "deleted_at" timestamp with time zone,
    CONSTRAINT "projects_slug_check" CHECK (("slug" ~ '^[a-z0-9-]{3,}$'::"text"))
);


ALTER TABLE "public"."projects" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."projects_active" AS
 SELECT "id",
    "org_id",
    "name",
    "slug",
    "description",
    "is_default",
    "created_at",
    "updated_at",
    "created_by",
    "updated_by",
    "deleted_at"
   FROM "public"."projects"
  WHERE ("deleted_at" IS NULL);


ALTER VIEW "public"."projects_active" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ratings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "asset_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "score" smallint NOT NULL,
    "comment" "text",
    "run_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ratings_score_check" CHECK ((("score" >= 1) AND ("score" <= 5)))
);


ALTER TABLE "public"."ratings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "org_id" "uuid",
    "asset_id" "uuid",
    "asset_external_id" "text",
    "mode" "text" NOT NULL,
    "policy_hash" "text" NOT NULL,
    "venue" "text" NOT NULL,
    "p95_ms" integer,
    "cost_est_usd" numeric(10,5),
    "attestation" "jsonb",
    "receipt" "jsonb",
    "mmr_root" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "runs_mode_check" CHECK (("mode" = ANY (ARRAY['auto'::"text", 'pin'::"text"])))
);


ALTER TABLE "public"."runs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."schedule_execution_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "schedule_id" "uuid" NOT NULL,
    "workflow_execution_id" "uuid",
    "scheduled_time" timestamp with time zone NOT NULL,
    "executed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "status" "text" NOT NULL,
    "error" "text",
    "execution_time_ms" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "schedule_execution_logs_status_check" CHECK (("status" = ANY (ARRAY['success'::"text", 'error'::"text", 'skipped'::"text"])))
);


ALTER TABLE "public"."schedule_execution_logs" OWNER TO "postgres";


COMMENT ON TABLE "public"."schedule_execution_logs" IS 'Logs each scheduled execution attempt';



CREATE TABLE IF NOT EXISTS "public"."session_signer_permissions" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "wallet_address" "text" NOT NULL,
    "enabled" boolean DEFAULT true,
    "enabled_at" timestamp with time zone DEFAULT "now"(),
    "revoked_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."session_signer_permissions" OWNER TO "postgres";


COMMENT ON TABLE "public"."session_signer_permissions" IS 'Tracks user permissions for session signers (autonomous transaction signing)';



CREATE TABLE IF NOT EXISTS "public"."subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "plan_id" "uuid" NOT NULL,
    "status" "text" NOT NULL,
    "billing_period" "text" NOT NULL,
    "payment_method" "text" NOT NULL,
    "current_period_start" timestamp with time zone NOT NULL,
    "current_period_end" timestamp with time zone NOT NULL,
    "trial_end" timestamp with time zone,
    "cancel_at_period_end" boolean DEFAULT false NOT NULL,
    "canceled_at" timestamp with time zone,
    "stripe_subscription_id" "text",
    "stripe_customer_id" "text",
    "coinbase_charge_id" "text",
    "crypto_wallet_address" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "subscriptions_billing_period_check" CHECK (("billing_period" = ANY (ARRAY['monthly'::"text", 'yearly'::"text"]))),
    CONSTRAINT "subscriptions_payment_method_check" CHECK (("payment_method" = ANY (ARRAY['stripe_card'::"text", 'stripe_paypal'::"text", 'crypto'::"text"]))),
    CONSTRAINT "subscriptions_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'trialing'::"text", 'past_due'::"text", 'canceled'::"text", 'paused'::"text"])))
);


ALTER TABLE "public"."subscriptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."usage_metrics" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "metric_name" "text" NOT NULL,
    "metric_value" integer DEFAULT 0 NOT NULL,
    "period_start" timestamp with time zone NOT NULL,
    "period_end" timestamp with time zone NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."usage_metrics" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_preferences" (
    "user_id" "uuid" NOT NULL,
    "sidebar_collapsed" boolean DEFAULT false,
    "theme" "text" DEFAULT 'system'::"text",
    "language" "text" DEFAULT 'en'::"text",
    "compact_mode" boolean DEFAULT false,
    "show_onboarding" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "user_preferences_theme_check" CHECK (("theme" = ANY (ARRAY['light'::"text", 'dark'::"text", 'system'::"text"])))
);


ALTER TABLE "public"."user_preferences" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_wallets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "wallet_address" "text" NOT NULL,
    "wallet_type" "text" NOT NULL,
    "chain_id" "text",
    "is_primary" boolean DEFAULT false,
    "verified_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_wallets" OWNER TO "postgres";


COMMENT ON TABLE "public"."user_wallets" IS 'User blockchain wallet addresses';



CREATE TABLE IF NOT EXISTS "public"."waitinglist" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "email" character varying(255) NOT NULL,
    "solana_wallet" character varying(44) NOT NULL,
    "discord_id" character varying(255) NOT NULL,
    "twitter_id" character varying(255) NOT NULL,
    "status" character varying(50) DEFAULT 'pending'::character varying,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "metadata" "jsonb",
    "notes" "text"
);


ALTER TABLE "public"."waitinglist" OWNER TO "postgres";


COMMENT ON TABLE "public"."waitinglist" IS 'Dedicated table for waiting list signups with crypto wallet and social media information';



COMMENT ON COLUMN "public"."waitinglist"."email" IS 'User email address (unique)';



COMMENT ON COLUMN "public"."waitinglist"."solana_wallet" IS 'Solana blockchain wallet address';



COMMENT ON COLUMN "public"."waitinglist"."discord_id" IS 'Discord ID or username';



COMMENT ON COLUMN "public"."waitinglist"."twitter_id" IS 'Twitter/X ID or handle';



COMMENT ON COLUMN "public"."waitinglist"."status" IS 'Status: pending, approved, invited, active, etc.';



COMMENT ON COLUMN "public"."waitinglist"."metadata" IS 'Additional metadata in JSON format';



COMMENT ON COLUMN "public"."waitinglist"."notes" IS 'Admin notes about this signup';



CREATE TABLE IF NOT EXISTS "public"."webhook_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "webhook_id" "uuid" NOT NULL,
    "workflow_execution_id" "uuid",
    "request_method" "text",
    "request_headers" "jsonb",
    "request_body" "jsonb",
    "request_query" "jsonb",
    "response_status" integer,
    "response_body" "jsonb",
    "error" "text",
    "ip_address" "text",
    "user_agent" "text",
    "execution_time_ms" integer,
    "executed_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."webhook_logs" OWNER TO "postgres";


COMMENT ON TABLE "public"."webhook_logs" IS 'Logs of webhook execution attempts';



COMMENT ON COLUMN "public"."webhook_logs"."execution_time_ms" IS 'Time taken to execute workflow in milliseconds';



CREATE TABLE IF NOT EXISTS "public"."workflow_executions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workflow_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'running'::"text",
    "mode" "text" DEFAULT 'manual'::"text",
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    "duration_ms" integer,
    "error" "text",
    "error_message" "text",
    "result" "jsonb",
    "execution_data" "jsonb" DEFAULT '{}'::"jsonb",
    "triggered_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "lucid_l2_execution_id" "text",
    CONSTRAINT "workflow_executions_mode_check" CHECK (("mode" = ANY (ARRAY['manual'::"text", 'trigger'::"text", 'webhook'::"text", 'test'::"text"]))),
    CONSTRAINT "workflow_executions_status_check" CHECK (("status" = ANY (ARRAY['running'::"text", 'success'::"text", 'error'::"text", 'cancelled'::"text", 'waiting'::"text"])))
);


ALTER TABLE "public"."workflow_executions" OWNER TO "postgres";


COMMENT ON TABLE "public"."workflow_executions" IS 'Tracks workflow execution history and status from Lucid-L2';



COMMENT ON COLUMN "public"."workflow_executions"."lucid_l2_execution_id" IS 'Lucid-L2 execution ID for status tracking';



CREATE TABLE IF NOT EXISTS "public"."workflow_schedules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workflow_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "cron_expression" "text" NOT NULL,
    "timezone" "text" DEFAULT 'UTC'::"text" NOT NULL,
    "enabled" boolean DEFAULT true NOT NULL,
    "last_run_at" timestamp with time zone,
    "last_run_status" "text",
    "last_run_error" "text",
    "next_run_at" timestamp with time zone,
    "run_count" integer DEFAULT 0 NOT NULL,
    "error_count" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    CONSTRAINT "workflow_schedules_last_run_status_check" CHECK (("last_run_status" = ANY (ARRAY['success'::"text", 'error'::"text", 'skipped'::"text"])))
);


ALTER TABLE "public"."workflow_schedules" OWNER TO "postgres";


COMMENT ON TABLE "public"."workflow_schedules" IS 'Stores cron-based schedules for workflow automation';



CREATE TABLE IF NOT EXISTS "public"."workflow_variables" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workflow_id" "uuid" NOT NULL,
    "key" "text" NOT NULL,
    "value" "text",
    "type" "text" DEFAULT 'string'::"text" NOT NULL,
    "is_secret" boolean DEFAULT false NOT NULL,
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    CONSTRAINT "workflow_variables_type_check" CHECK (("type" = ANY (ARRAY['string'::"text", 'number'::"text", 'boolean'::"text", 'secret'::"text"])))
);


ALTER TABLE "public"."workflow_variables" OWNER TO "postgres";


COMMENT ON TABLE "public"."workflow_variables" IS 'Stores reusable variables for workflows - can be referenced in nodes using {{$vars.key}}';



COMMENT ON COLUMN "public"."workflow_variables"."key" IS 'Variable name - used as {{$vars.key}} in nodes';



COMMENT ON COLUMN "public"."workflow_variables"."value" IS 'Variable value - stored as text, converted to type at execution';



COMMENT ON COLUMN "public"."workflow_variables"."type" IS 'Variable type: string, number, boolean, or secret';



COMMENT ON COLUMN "public"."workflow_variables"."is_secret" IS 'Whether the variable contains sensitive data (auto-set for secret type)';



CREATE TABLE IF NOT EXISTS "public"."workflow_versions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workflow_id" "uuid" NOT NULL,
    "version_number" integer NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "nodes" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "edges" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "pin_data" "jsonb",
    "settings" "jsonb" DEFAULT '{}'::"jsonb",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_auto_save" boolean DEFAULT false,
    "change_summary" "text"
);


ALTER TABLE "public"."workflow_versions" OWNER TO "postgres";


COMMENT ON TABLE "public"."workflow_versions" IS 'Version history for workflow changes';



COMMENT ON COLUMN "public"."workflow_versions"."version_number" IS 'Sequential version number starting from 1';



COMMENT ON COLUMN "public"."workflow_versions"."is_auto_save" IS 'True if auto-saved, false if manually saved';



COMMENT ON COLUMN "public"."workflow_versions"."change_summary" IS 'Optional description of changes';



CREATE TABLE IF NOT EXISTS "public"."workflow_webhooks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workflow_id" "uuid" NOT NULL,
    "path" "text" NOT NULL,
    "method" "text" DEFAULT 'POST'::"text",
    "api_key" "text" NOT NULL,
    "enabled" boolean DEFAULT true,
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "workflow_webhooks_method_check" CHECK (("method" = ANY (ARRAY['GET'::"text", 'POST'::"text", 'PUT'::"text", 'DELETE'::"text", 'PATCH'::"text"])))
);


ALTER TABLE "public"."workflow_webhooks" OWNER TO "postgres";


COMMENT ON TABLE "public"."workflow_webhooks" IS 'Webhook endpoints for triggering workflows via HTTP';



COMMENT ON COLUMN "public"."workflow_webhooks"."path" IS 'Unique URL path for the webhook (e.g., "a1b2c3d4")';



COMMENT ON COLUMN "public"."workflow_webhooks"."api_key" IS 'API key for webhook authentication';



COMMENT ON COLUMN "public"."workflow_webhooks"."enabled" IS 'Whether the webhook is active';



CREATE TABLE IF NOT EXISTS "public"."workflows" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "organization_id" "uuid",
    "name" "text" NOT NULL,
    "description" "text",
    "nodes" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "edges" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "settings" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "pin_data" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "status" "text" DEFAULT 'draft'::"text",
    "active" boolean DEFAULT false,
    "tags" "text"[] DEFAULT ARRAY[]::"text"[],
    "published_at" timestamp with time zone,
    "version" integer DEFAULT 1,
    "version_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "lucid_l2_workflow_id" "text",
    "lucid_l2_synced_at" timestamp with time zone,
    "lucid_l2_last_error" "text",
    CONSTRAINT "workflow_name_not_empty" CHECK (("length"(TRIM(BOTH FROM "name")) > 0)),
    CONSTRAINT "workflows_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'active'::"text", 'inactive'::"text"])))
);


ALTER TABLE "public"."workflows" OWNER TO "postgres";


COMMENT ON TABLE "public"."workflows" IS 'Stores workflow definitions with nodes, edges, and pin data';



COMMENT ON COLUMN "public"."workflows"."nodes" IS 'JSONB array of workflow nodes';



COMMENT ON COLUMN "public"."workflows"."edges" IS 'JSONB array of node connections';



COMMENT ON COLUMN "public"."workflows"."settings" IS 'JSONB object with workflow settings';



COMMENT ON COLUMN "public"."workflows"."pin_data" IS 'JSONB object with pinned test data per node';



COMMENT ON COLUMN "public"."workflows"."lucid_l2_workflow_id" IS 'ID of workflow in Lucid-L2 remote n8n instance';



COMMENT ON COLUMN "public"."workflows"."lucid_l2_synced_at" IS 'Last successful sync timestamp with Lucid-L2';



COMMENT ON COLUMN "public"."workflows"."lucid_l2_last_error" IS 'Last error message from Lucid-L2 sync attempt';



CREATE OR REPLACE VIEW "public"."workspace_stats" AS
 SELECT "o"."id" AS "org_id",
    "o"."name" AS "org_name",
    "count"(DISTINCT "p"."id") AS "projects_count",
    "count"(DISTINCT "e"."id") AS "environments_count",
    "count"(DISTINCT "om"."user_id") AS "members_count",
    "count"(DISTINCT "a"."id") AS "agents_count"
   FROM (((("public"."organizations" "o"
     LEFT JOIN "public"."projects_active" "p" ON (("o"."id" = "p"."org_id")))
     LEFT JOIN "public"."environments_active" "e" ON (("p"."id" = "e"."project_id")))
     LEFT JOIN "public"."organization_members" "om" ON (("o"."id" = "om"."organization_id")))
     LEFT JOIN "public"."agents_active" "a" ON (("p"."id" = "a"."project_id")))
  GROUP BY "o"."id", "o"."name";


ALTER VIEW "public"."workspace_stats" OWNER TO "postgres";


ALTER TABLE ONLY "public"."agents"
    ADD CONSTRAINT "agents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."agents"
    ADD CONSTRAINT "agents_unique_slug_per_project" UNIQUE ("project_id", "slug");



ALTER TABLE ONLY "public"."ai_workflow_generations"
    ADD CONSTRAINT "ai_workflow_generations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."app_agents"
    ADD CONSTRAINT "app_agents_pkey" PRIMARY KEY ("app_id", "agent_id");



ALTER TABLE ONLY "public"."apps"
    ADD CONSTRAINT "apps_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."apps"
    ADD CONSTRAINT "apps_unique_slug_per_project" UNIQUE ("project_id", "slug");



ALTER TABLE ONLY "public"."asset_categories"
    ADD CONSTRAINT "asset_categories_pkey" PRIMARY KEY ("asset_id", "category_id");



ALTER TABLE ONLY "public"."asset_likes"
    ADD CONSTRAINT "asset_likes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."asset_likes"
    ADD CONSTRAINT "asset_likes_unique" UNIQUE ("user_id", "asset_id");



ALTER TABLE ONLY "public"."assets"
    ADD CONSTRAINT "assets_external_id_key" UNIQUE ("external_id");



ALTER TABLE ONLY "public"."assets"
    ADD CONSTRAINT "assets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."assets"
    ADD CONSTRAINT "assets_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."bookmarks"
    ADD CONSTRAINT "bookmarks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bookmarks"
    ADD CONSTRAINT "bookmarks_unique" UNIQUE ("user_id", "asset_id");



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."contacts"
    ADD CONSTRAINT "contacts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contributor_follows"
    ADD CONSTRAINT "contributor_follows_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contributor_follows"
    ADD CONSTRAINT "contributor_follows_unique" UNIQUE ("follower_id", "following_id");



ALTER TABLE ONLY "public"."credential_usage"
    ADD CONSTRAINT "credential_usage_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."credentials"
    ADD CONSTRAINT "credentials_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."email_suppressions"
    ADD CONSTRAINT "email_suppressions_pkey" PRIMARY KEY ("address");



ALTER TABLE ONLY "public"."emails"
    ADD CONSTRAINT "emails_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."environments"
    ADD CONSTRAINT "environments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."environments"
    ADD CONSTRAINT "environments_unique_name_per_project" UNIQUE ("project_id", "name");



ALTER TABLE ONLY "public"."favorites"
    ADD CONSTRAINT "favorites_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."favorites"
    ADD CONSTRAINT "favorites_user_id_org_id_favoritable_type_favoritable_id_key" UNIQUE ("user_id", "org_id", "favoritable_type", "favoritable_id");



ALTER TABLE ONLY "public"."identity_links"
    ADD CONSTRAINT "identity_links_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."invite_tokens"
    ADD CONSTRAINT "invite_tokens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."invite_tokens"
    ADD CONSTRAINT "invite_tokens_token_key" UNIQUE ("token");



ALTER TABLE ONLY "public"."newsletter_subscribers"
    ADD CONSTRAINT "newsletter_subscribers_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."newsletter_subscribers"
    ADD CONSTRAINT "newsletter_subscribers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."node_execution_data"
    ADD CONSTRAINT "node_execution_data_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notification_preferences"
    ADD CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notification_preferences"
    ADD CONSTRAINT "notification_preferences_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."org_follows"
    ADD CONSTRAINT "org_follows_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."org_follows"
    ADD CONSTRAINT "org_follows_unique" UNIQUE ("user_id", "org_id");



ALTER TABLE ONLY "public"."org_invites"
    ADD CONSTRAINT "org_invites_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."org_invites"
    ADD CONSTRAINT "org_invites_token_key" UNIQUE ("token");



ALTER TABLE ONLY "public"."organization_members"
    ADD CONSTRAINT "organization_members_org_id_user_id_key" UNIQUE ("org_id", "user_id");



ALTER TABLE ONLY "public"."organization_members"
    ADD CONSTRAINT "organization_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."plans"
    ADD CONSTRAINT "plans_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."plans"
    ADD CONSTRAINT "plans_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_unique_slug_per_org" UNIQUE ("org_id", "slug");



ALTER TABLE ONLY "public"."ratings"
    ADD CONSTRAINT "ratings_asset_id_user_id_key" UNIQUE ("asset_id", "user_id");



ALTER TABLE ONLY "public"."ratings"
    ADD CONSTRAINT "ratings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."runs"
    ADD CONSTRAINT "runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."schedule_execution_logs"
    ADD CONSTRAINT "schedule_execution_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."session_signer_permissions"
    ADD CONSTRAINT "session_signer_permissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."session_signer_permissions"
    ADD CONSTRAINT "session_signer_permissions_user_id_wallet_address_key" UNIQUE ("user_id", "wallet_address");



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_stripe_subscription_id_key" UNIQUE ("stripe_subscription_id");



ALTER TABLE ONLY "public"."credential_usage"
    ADD CONSTRAINT "unique_credential_usage" UNIQUE ("credential_id", "workflow_id", "node_id");



ALTER TABLE ONLY "public"."usage_metrics"
    ADD CONSTRAINT "unique_metric_per_org_per_period" UNIQUE ("org_id", "metric_name", "period_start", "period_end");



ALTER TABLE ONLY "public"."identity_links"
    ADD CONSTRAINT "unique_provider_external_id" UNIQUE ("provider", "external_id");



ALTER TABLE ONLY "public"."user_wallets"
    ADD CONSTRAINT "unique_user_wallet" UNIQUE ("user_id", "wallet_address");



ALTER TABLE ONLY "public"."workflow_variables"
    ADD CONSTRAINT "unique_workflow_variable" UNIQUE ("workflow_id", "key");



ALTER TABLE ONLY "public"."workflow_versions"
    ADD CONSTRAINT "unique_workflow_version" UNIQUE ("workflow_id", "version_number");



ALTER TABLE ONLY "public"."usage_metrics"
    ADD CONSTRAINT "usage_metrics_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_preferences"
    ADD CONSTRAINT "user_preferences_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."user_wallets"
    ADD CONSTRAINT "user_wallets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."waitinglist"
    ADD CONSTRAINT "waitinglist_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."waitinglist"
    ADD CONSTRAINT "waitinglist_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."webhook_logs"
    ADD CONSTRAINT "webhook_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workflow_executions"
    ADD CONSTRAINT "workflow_executions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workflow_schedules"
    ADD CONSTRAINT "workflow_schedules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workflow_variables"
    ADD CONSTRAINT "workflow_variables_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workflow_versions"
    ADD CONSTRAINT "workflow_versions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workflow_webhooks"
    ADD CONSTRAINT "workflow_webhooks_path_key" UNIQUE ("path");



ALTER TABLE ONLY "public"."workflow_webhooks"
    ADD CONSTRAINT "workflow_webhooks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workflows"
    ADD CONSTRAINT "workflows_pkey" PRIMARY KEY ("id");



CREATE INDEX "asset_likes_asset_id_idx" ON "public"."asset_likes" USING "btree" ("asset_id");



CREATE INDEX "asset_likes_created_at_idx" ON "public"."asset_likes" USING "btree" ("created_at");



CREATE INDEX "asset_likes_user_id_idx" ON "public"."asset_likes" USING "btree" ("user_id");



CREATE INDEX "bookmarks_asset_id_idx" ON "public"."bookmarks" USING "btree" ("asset_id");



CREATE INDEX "bookmarks_created_at_idx" ON "public"."bookmarks" USING "btree" ("created_at");



CREATE INDEX "bookmarks_user_id_idx" ON "public"."bookmarks" USING "btree" ("user_id");



CREATE INDEX "contributor_follows_created_at_idx" ON "public"."contributor_follows" USING "btree" ("created_at");



CREATE INDEX "contributor_follows_follower_id_idx" ON "public"."contributor_follows" USING "btree" ("follower_id");



CREATE INDEX "contributor_follows_following_id_idx" ON "public"."contributor_follows" USING "btree" ("following_id");



CREATE UNIQUE INDEX "emails_dedupe_key" ON "public"."emails" USING "btree" ("dedupe_key") WHERE ("dedupe_key" IS NOT NULL);



CREATE INDEX "emails_provider_id" ON "public"."emails" USING "btree" ("provider_id") WHERE ("provider_id" IS NOT NULL);



CREATE INDEX "emails_status" ON "public"."emails" USING "btree" ("status", "created_at" DESC);



CREATE INDEX "emails_to_address" ON "public"."emails" USING "btree" ("to_address");



CREATE INDEX "idx_agents_created_at" ON "public"."agents" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_agents_hot_path" ON "public"."agents" USING "btree" ("org_id", "project_id", "env_id", "created_at" DESC) WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_agents_project" ON "public"."agents" USING "btree" ("project_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_agents_recent" ON "public"."agents" USING "btree" ("created_at" DESC) WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_agents_scope" ON "public"."agents" USING "btree" ("org_id", "project_id", "env_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_ai_gen_success" ON "public"."ai_workflow_generations" USING "btree" ("success", "created_at" DESC);



CREATE INDEX "idx_ai_gen_user_created" ON "public"."ai_workflow_generations" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "idx_ai_gen_user_success" ON "public"."ai_workflow_generations" USING "btree" ("user_id", "success");



CREATE INDEX "idx_app_agents_agent" ON "public"."app_agents" USING "btree" ("agent_id");



CREATE INDEX "idx_app_agents_app" ON "public"."app_agents" USING "btree" ("app_id");



CREATE INDEX "idx_apps_project" ON "public"."apps" USING "btree" ("project_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_apps_public" ON "public"."apps" USING "btree" ("is_public") WHERE (("deleted_at" IS NULL) AND ("is_active" = true));



CREATE INDEX "idx_apps_scope" ON "public"."apps" USING "btree" ("org_id", "project_id", "env_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_asset_categories_asset" ON "public"."asset_categories" USING "btree" ("asset_id");



CREATE INDEX "idx_asset_categories_category" ON "public"."asset_categories" USING "btree" ("category_id");



CREATE INDEX "idx_assets_external_id" ON "public"."assets" USING "btree" ("external_id");



CREATE INDEX "idx_assets_kind" ON "public"."assets" USING "btree" ("kind");



CREATE INDEX "idx_assets_owner_org" ON "public"."assets" USING "btree" ("owner_org_id");



CREATE INDEX "idx_assets_owner_user" ON "public"."assets" USING "btree" ("owner_user_id");



CREATE INDEX "idx_assets_slug" ON "public"."assets" USING "btree" ("slug");



CREATE INDEX "idx_assets_tags" ON "public"."assets" USING "gin" ("tags");



CREATE INDEX "idx_assets_visibility" ON "public"."assets" USING "btree" ("visibility");



CREATE INDEX "idx_contacts_created_at" ON "public"."contacts" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_contacts_email" ON "public"."contacts" USING "btree" ("email");



CREATE INDEX "idx_contacts_form_type" ON "public"."contacts" USING "btree" ("form_type");



CREATE INDEX "idx_contacts_priority" ON "public"."contacts" USING "btree" ("priority");



CREATE INDEX "idx_contacts_source" ON "public"."contacts" USING "btree" ("source");



CREATE INDEX "idx_credential_usage_credential" ON "public"."credential_usage" USING "btree" ("credential_id");



CREATE INDEX "idx_credential_usage_workflow" ON "public"."credential_usage" USING "btree" ("workflow_id");



CREATE INDEX "idx_credentials_org" ON "public"."credentials" USING "btree" ("organization_id");



CREATE INDEX "idx_credentials_type" ON "public"."credentials" USING "btree" ("type");



CREATE INDEX "idx_credentials_user" ON "public"."credentials" USING "btree" ("user_id");



CREATE INDEX "idx_environments_hot_path" ON "public"."environments" USING "btree" ("project_id", "deleted_at", "created_at" DESC) WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_environments_project_id" ON "public"."environments" USING "btree" ("project_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_favorites_poly" ON "public"."favorites" USING "btree" ("favoritable_type", "favoritable_id");



CREATE INDEX "idx_favorites_sort_order" ON "public"."favorites" USING "btree" ("user_id", "org_id", "sort_order");



CREATE INDEX "idx_favorites_type" ON "public"."favorites" USING "btree" ("favoritable_type");



CREATE INDEX "idx_favorites_user_org" ON "public"."favorites" USING "btree" ("user_id", "org_id");



CREATE INDEX "idx_identity_links_provider_external" ON "public"."identity_links" USING "btree" ("provider", "external_id");



CREATE INDEX "idx_identity_links_user_id" ON "public"."identity_links" USING "btree" ("user_id");



CREATE INDEX "idx_invite_tokens_enabled" ON "public"."invite_tokens" USING "btree" ("enabled") WHERE ("enabled" = true);



CREATE INDEX "idx_invite_tokens_org" ON "public"."invite_tokens" USING "btree" ("organization_id");



CREATE INDEX "idx_invite_tokens_token" ON "public"."invite_tokens" USING "btree" ("token");



CREATE INDEX "idx_newsletter_subscribers_active" ON "public"."newsletter_subscribers" USING "btree" ("is_active") WHERE ("is_active" = true);



CREATE INDEX "idx_newsletter_subscribers_email" ON "public"."newsletter_subscribers" USING "btree" ("email");



CREATE INDEX "idx_node_execution_data_execution_id" ON "public"."node_execution_data" USING "btree" ("execution_id");



CREATE INDEX "idx_node_execution_data_node_name" ON "public"."node_execution_data" USING "btree" ("node_name");



CREATE INDEX "idx_node_execution_data_status" ON "public"."node_execution_data" USING "btree" ("status");



CREATE INDEX "idx_notification_prefs_user_id" ON "public"."notification_preferences" USING "btree" ("user_id");



CREATE INDEX "idx_notifications_severity" ON "public"."notifications" USING "btree" ("severity");



CREATE INDEX "idx_notifications_user_id_created" ON "public"."notifications" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "idx_notifications_user_org_created" ON "public"."notifications" USING "btree" ("user_id", "organization_id", "created_at" DESC);



CREATE INDEX "idx_notifications_user_org_unread" ON "public"."notifications" USING "btree" ("user_id", "organization_id", "read") WHERE ("read" = false);



CREATE INDEX "idx_notifications_user_severity_created" ON "public"."notifications" USING "btree" ("user_id", "severity", "created_at" DESC);



CREATE INDEX "idx_notifications_user_unread" ON "public"."notifications" USING "btree" ("user_id", "read") WHERE ("read" = false);



CREATE INDEX "idx_org_invites_browse" ON "public"."org_invites" USING "btree" ("org_id", "created_at" DESC);



CREATE INDEX "idx_org_invites_org" ON "public"."org_invites" USING "btree" ("org_id", "status", "expires_at" DESC);



CREATE INDEX "idx_org_invites_token" ON "public"."org_invites" USING "btree" ("token") WHERE ("status" = 'pending'::"public"."invite_status");



CREATE INDEX "idx_org_members_org_id" ON "public"."organization_members" USING "btree" ("org_id");



CREATE INDEX "idx_org_members_organization_id" ON "public"."organization_members" USING "btree" ("organization_id");



CREATE INDEX "idx_org_members_role" ON "public"."organization_members" USING "btree" ("role");



CREATE INDEX "idx_org_members_user_id" ON "public"."organization_members" USING "btree" ("user_id");



CREATE INDEX "idx_organizations_created_by" ON "public"."organizations" USING "btree" ("created_by");



CREATE INDEX "idx_organizations_github" ON "public"."organizations" USING "btree" ("github_username") WHERE ("github_username" IS NOT NULL);



CREATE INDEX "idx_organizations_metadata" ON "public"."organizations" USING "gin" ("metadata");



CREATE INDEX "idx_organizations_slug" ON "public"."organizations" USING "btree" ("slug");



CREATE INDEX "idx_organizations_twitter" ON "public"."organizations" USING "btree" ("twitter_username") WHERE ("twitter_username" IS NOT NULL);



CREATE INDEX "idx_orgs_slug" ON "public"."organizations" USING "btree" ("slug");



CREATE INDEX "idx_orgs_verified" ON "public"."organizations" USING "btree" ("verified") WHERE ("verified" = true);



CREATE INDEX "idx_payments_created_at" ON "public"."payments" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_payments_org_id" ON "public"."payments" USING "btree" ("org_id");



CREATE INDEX "idx_payments_provider_payment_id" ON "public"."payments" USING "btree" ("provider", "provider_payment_id");



CREATE INDEX "idx_payments_status" ON "public"."payments" USING "btree" ("status");



CREATE INDEX "idx_payments_subscription_id" ON "public"."payments" USING "btree" ("subscription_id");



CREATE INDEX "idx_plans_name" ON "public"."plans" USING "btree" ("name") WHERE ("is_active" = true);



CREATE INDEX "idx_plans_sort_order" ON "public"."plans" USING "btree" ("sort_order") WHERE ("is_active" = true);



CREATE INDEX "idx_profiles_email" ON "public"."profiles" USING "btree" ("email");



CREATE INDEX "idx_profiles_handle" ON "public"."profiles" USING "btree" ("handle");



CREATE INDEX "idx_projects_hot_path" ON "public"."projects" USING "btree" ("org_id", "deleted_at", "created_at" DESC) WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_projects_org_id" ON "public"."projects" USING "btree" ("org_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_ratings_asset_id" ON "public"."ratings" USING "btree" ("asset_id");



CREATE INDEX "idx_ratings_user_id" ON "public"."ratings" USING "btree" ("user_id");



CREATE INDEX "idx_runs_asset" ON "public"."runs" USING "btree" ("asset_id");



CREATE INDEX "idx_runs_created" ON "public"."runs" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_runs_external" ON "public"."runs" USING "btree" ("asset_external_id");



CREATE INDEX "idx_runs_org" ON "public"."runs" USING "btree" ("org_id");



CREATE INDEX "idx_runs_user" ON "public"."runs" USING "btree" ("user_id");



CREATE INDEX "idx_schedule_logs_execution" ON "public"."schedule_execution_logs" USING "btree" ("workflow_execution_id");



CREATE INDEX "idx_schedule_logs_schedule" ON "public"."schedule_execution_logs" USING "btree" ("schedule_id", "executed_at" DESC);



CREATE INDEX "idx_schedules_enabled" ON "public"."workflow_schedules" USING "btree" ("enabled");



CREATE INDEX "idx_schedules_next_run" ON "public"."workflow_schedules" USING "btree" ("next_run_at") WHERE ("enabled" = true);



CREATE INDEX "idx_schedules_workflow" ON "public"."workflow_schedules" USING "btree" ("workflow_id");



CREATE INDEX "idx_session_signer_enabled" ON "public"."session_signer_permissions" USING "btree" ("enabled") WHERE ("enabled" = true);



CREATE INDEX "idx_session_signer_user_id" ON "public"."session_signer_permissions" USING "btree" ("user_id");



CREATE INDEX "idx_session_signer_wallet" ON "public"."session_signer_permissions" USING "btree" ("wallet_address");



CREATE INDEX "idx_subscriptions_current_period_end" ON "public"."subscriptions" USING "btree" ("current_period_end");



CREATE INDEX "idx_subscriptions_org_id" ON "public"."subscriptions" USING "btree" ("org_id");



CREATE INDEX "idx_subscriptions_plan_id" ON "public"."subscriptions" USING "btree" ("plan_id");



CREATE INDEX "idx_subscriptions_status" ON "public"."subscriptions" USING "btree" ("status");



CREATE INDEX "idx_subscriptions_stripe_subscription_id" ON "public"."subscriptions" USING "btree" ("stripe_subscription_id");



CREATE UNIQUE INDEX "idx_subscriptions_unique_active_per_org" ON "public"."subscriptions" USING "btree" ("org_id") WHERE ("status" = 'active'::"text");



CREATE UNIQUE INDEX "idx_unique_primary_wallet" ON "public"."user_wallets" USING "btree" ("user_id", "wallet_type") WHERE ("is_primary" = true);



CREATE INDEX "idx_usage_metrics_metric_name" ON "public"."usage_metrics" USING "btree" ("metric_name");



CREATE INDEX "idx_usage_metrics_org_id" ON "public"."usage_metrics" USING "btree" ("org_id");



CREATE INDEX "idx_usage_metrics_org_metric" ON "public"."usage_metrics" USING "btree" ("org_id", "metric_name");



CREATE INDEX "idx_usage_metrics_period" ON "public"."usage_metrics" USING "btree" ("period_start", "period_end");



CREATE INDEX "idx_user_preferences_user_id" ON "public"."user_preferences" USING "btree" ("user_id");



CREATE INDEX "idx_user_wallets_address" ON "public"."user_wallets" USING "btree" ("wallet_address");



CREATE INDEX "idx_user_wallets_user_id" ON "public"."user_wallets" USING "btree" ("user_id");



CREATE INDEX "idx_variables_key" ON "public"."workflow_variables" USING "btree" ("workflow_id", "key");



CREATE INDEX "idx_variables_workflow" ON "public"."workflow_variables" USING "btree" ("workflow_id");



CREATE INDEX "idx_waitinglist_created_at" ON "public"."waitinglist" USING "btree" ("created_at");



CREATE INDEX "idx_waitinglist_email" ON "public"."waitinglist" USING "btree" ("email");



CREATE INDEX "idx_waitinglist_solana_wallet" ON "public"."waitinglist" USING "btree" ("solana_wallet");



CREATE UNIQUE INDEX "idx_waitinglist_solana_wallet_unique" ON "public"."waitinglist" USING "btree" ("solana_wallet");



CREATE INDEX "idx_waitinglist_status" ON "public"."waitinglist" USING "btree" ("status");



CREATE INDEX "idx_webhook_logs_date" ON "public"."webhook_logs" USING "btree" ("executed_at" DESC);



CREATE INDEX "idx_webhook_logs_execution" ON "public"."webhook_logs" USING "btree" ("workflow_execution_id");



CREATE INDEX "idx_webhook_logs_webhook" ON "public"."webhook_logs" USING "btree" ("webhook_id");



CREATE INDEX "idx_webhooks_enabled" ON "public"."workflow_webhooks" USING "btree" ("enabled") WHERE ("enabled" = true);



CREATE INDEX "idx_webhooks_path" ON "public"."workflow_webhooks" USING "btree" ("path");



CREATE INDEX "idx_webhooks_workflow" ON "public"."workflow_webhooks" USING "btree" ("workflow_id");



CREATE INDEX "idx_workflow_executions_lucid_l2" ON "public"."workflow_executions" USING "btree" ("lucid_l2_execution_id") WHERE ("lucid_l2_execution_id" IS NOT NULL);



CREATE INDEX "idx_workflow_executions_started_at" ON "public"."workflow_executions" USING "btree" ("started_at" DESC);



CREATE INDEX "idx_workflow_executions_status" ON "public"."workflow_executions" USING "btree" ("status");



CREATE INDEX "idx_workflow_executions_triggered_by" ON "public"."workflow_executions" USING "btree" ("triggered_by");



CREATE INDEX "idx_workflow_executions_workflow_id" ON "public"."workflow_executions" USING "btree" ("workflow_id");



CREATE INDEX "idx_workflow_versions_created" ON "public"."workflow_versions" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_workflow_versions_number" ON "public"."workflow_versions" USING "btree" ("workflow_id", "version_number" DESC);



CREATE INDEX "idx_workflow_versions_workflow" ON "public"."workflow_versions" USING "btree" ("workflow_id");



CREATE INDEX "idx_workflows_active" ON "public"."workflows" USING "btree" ("active");



CREATE INDEX "idx_workflows_created_at" ON "public"."workflows" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_workflows_lucid_l2_id" ON "public"."workflows" USING "btree" ("lucid_l2_workflow_id") WHERE ("lucid_l2_workflow_id" IS NOT NULL);



CREATE INDEX "idx_workflows_organization_id" ON "public"."workflows" USING "btree" ("organization_id");



CREATE INDEX "idx_workflows_status" ON "public"."workflows" USING "btree" ("status");



CREATE INDEX "idx_workflows_tags" ON "public"."workflows" USING "gin" ("tags");



CREATE INDEX "idx_workflows_updated_at" ON "public"."workflows" USING "btree" ("updated_at" DESC);



CREATE INDEX "idx_workflows_user_id" ON "public"."workflows" USING "btree" ("user_id");



CREATE UNIQUE INDEX "one_default_env_per_project" ON "public"."environments" USING "btree" ("project_id") WHERE (("is_default" = true) AND ("deleted_at" IS NULL));



CREATE UNIQUE INDEX "one_default_project_per_org" ON "public"."projects" USING "btree" ("org_id") WHERE (("is_default" = true) AND ("deleted_at" IS NULL));



CREATE INDEX "org_follows_created_at_idx" ON "public"."org_follows" USING "btree" ("created_at");



CREATE INDEX "org_follows_org_id_idx" ON "public"."org_follows" USING "btree" ("org_id");



CREATE INDEX "org_follows_user_id_idx" ON "public"."org_follows" USING "btree" ("user_id");



CREATE UNIQUE INDEX "org_invites_one_live_per_email" ON "public"."org_invites" USING "btree" ("org_id", "lower"("email")) WHERE (("status" = 'pending'::"public"."invite_status") AND ("email" IS NOT NULL));



CREATE OR REPLACE TRIGGER "auto_create_workspace_trigger" AFTER INSERT ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."auto_create_personal_workspace"();



CREATE OR REPLACE TRIGGER "credentials_updated_at" BEFORE UPDATE ON "public"."credentials" FOR EACH ROW EXECUTE FUNCTION "public"."update_credentials_updated_at"();



CREATE OR REPLACE TRIGGER "enforce_single_personal_workspace" BEFORE INSERT OR UPDATE ON "public"."organization_members" FOR EACH ROW EXECUTE FUNCTION "public"."check_single_personal_workspace"();



CREATE OR REPLACE TRIGGER "node_execution_data_updated_at" BEFORE UPDATE ON "public"."node_execution_data" FOR EACH ROW EXECUTE FUNCTION "public"."update_node_execution_data_updated_at"();



CREATE OR REPLACE TRIGGER "prevent_project_deletion_with_resources" BEFORE UPDATE ON "public"."projects" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_project_deletion_with_resources"();



CREATE OR REPLACE TRIGGER "schedule_next_run" BEFORE INSERT OR UPDATE ON "public"."workflow_schedules" FOR EACH ROW EXECUTE FUNCTION "public"."update_schedule_next_run"();



CREATE OR REPLACE TRIGGER "schedule_updated_at" BEFORE UPDATE ON "public"."workflow_schedules" FOR EACH ROW EXECUTE FUNCTION "public"."update_schedule_updated_at"();



CREATE OR REPLACE TRIGGER "set_invite_token_updated_at" BEFORE UPDATE ON "public"."invite_tokens" FOR EACH ROW EXECUTE FUNCTION "public"."update_invite_token_updated_at"();



CREATE OR REPLACE TRIGGER "sync_org_columns_trigger" BEFORE INSERT OR UPDATE ON "public"."organization_members" FOR EACH ROW EXECUTE FUNCTION "public"."sync_org_id_columns"();



CREATE OR REPLACE TRIGGER "trigger_create_default_project_and_env" AFTER INSERT ON "public"."organizations" FOR EACH ROW EXECUTE FUNCTION "public"."create_default_project_and_env"();



CREATE OR REPLACE TRIGGER "update_agents_updated_at" BEFORE UPDATE ON "public"."agents" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_apps_updated_at" BEFORE UPDATE ON "public"."apps" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_assets_updated_at" BEFORE UPDATE ON "public"."assets" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_contacts_updated_at" BEFORE UPDATE ON "public"."contacts" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_environments_updated_at" BEFORE UPDATE ON "public"."environments" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_favorites_updated_at" BEFORE UPDATE ON "public"."favorites" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_newsletter_subscribers_updated_at" BEFORE UPDATE ON "public"."newsletter_subscribers" FOR EACH ROW EXECUTE FUNCTION "public"."update_newsletter_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_notification_preferences_updated_at" BEFORE UPDATE ON "public"."notification_preferences" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_payments_updated_at" BEFORE UPDATE ON "public"."payments" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_plans_updated_at" BEFORE UPDATE ON "public"."plans" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_projects_updated_at" BEFORE UPDATE ON "public"."projects" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_ratings_updated_at" BEFORE UPDATE ON "public"."ratings" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_session_signer_permissions_updated_at" BEFORE UPDATE ON "public"."session_signer_permissions" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_subscriptions_updated_at" BEFORE UPDATE ON "public"."subscriptions" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_user_preferences_updated_at" BEFORE UPDATE ON "public"."user_preferences" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_waitinglist_updated_at" BEFORE UPDATE ON "public"."waitinglist" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "variable_is_secret" BEFORE INSERT OR UPDATE ON "public"."workflow_variables" FOR EACH ROW EXECUTE FUNCTION "public"."update_variable_is_secret"();



CREATE OR REPLACE TRIGGER "variable_updated_at" BEFORE UPDATE ON "public"."workflow_variables" FOR EACH ROW EXECUTE FUNCTION "public"."update_variable_updated_at"();



CREATE OR REPLACE TRIGGER "webhook_update_timestamp" BEFORE UPDATE ON "public"."workflow_webhooks" FOR EACH ROW EXECUTE FUNCTION "public"."update_webhook_timestamp"();



CREATE OR REPLACE TRIGGER "workflows_updated_at" BEFORE UPDATE ON "public"."workflows" FOR EACH ROW EXECUTE FUNCTION "public"."update_workflows_updated_at"();



ALTER TABLE ONLY "public"."agents"
    ADD CONSTRAINT "agents_env_id_fkey" FOREIGN KEY ("env_id") REFERENCES "public"."environments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."agents"
    ADD CONSTRAINT "agents_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."agents"
    ADD CONSTRAINT "agents_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_workflow_generations"
    ADD CONSTRAINT "ai_workflow_generations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."app_agents"
    ADD CONSTRAINT "app_agents_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."app_agents"
    ADD CONSTRAINT "app_agents_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."apps"
    ADD CONSTRAINT "apps_env_id_fkey" FOREIGN KEY ("env_id") REFERENCES "public"."environments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."apps"
    ADD CONSTRAINT "apps_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."apps"
    ADD CONSTRAINT "apps_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."asset_categories"
    ADD CONSTRAINT "asset_categories_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."asset_categories"
    ADD CONSTRAINT "asset_categories_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."asset_likes"
    ADD CONSTRAINT "asset_likes_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."assets"
    ADD CONSTRAINT "assets_owner_org_id_fkey" FOREIGN KEY ("owner_org_id") REFERENCES "public"."organizations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."bookmarks"
    ADD CONSTRAINT "bookmarks_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."credential_usage"
    ADD CONSTRAINT "credential_usage_credential_id_fkey" FOREIGN KEY ("credential_id") REFERENCES "public"."credentials"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."credential_usage"
    ADD CONSTRAINT "credential_usage_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."credentials"
    ADD CONSTRAINT "credentials_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."credentials"
    ADD CONSTRAINT "credentials_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."credentials"
    ADD CONSTRAINT "credentials_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."environments"
    ADD CONSTRAINT "environments_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."favorites"
    ADD CONSTRAINT "favorites_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."favorites"
    ADD CONSTRAINT "favorites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."invite_tokens"
    ADD CONSTRAINT "invite_tokens_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."node_execution_data"
    ADD CONSTRAINT "node_execution_data_execution_id_fkey" FOREIGN KEY ("execution_id") REFERENCES "public"."workflow_executions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."org_follows"
    ADD CONSTRAINT "org_follows_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."org_invites"
    ADD CONSTRAINT "org_invites_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organization_members"
    ADD CONSTRAINT "organization_members_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organization_members"
    ADD CONSTRAINT "organization_members_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ratings"
    ADD CONSTRAINT "ratings_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."runs"
    ADD CONSTRAINT "runs_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."runs"
    ADD CONSTRAINT "runs_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."schedule_execution_logs"
    ADD CONSTRAINT "schedule_execution_logs_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "public"."workflow_schedules"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."schedule_execution_logs"
    ADD CONSTRAINT "schedule_execution_logs_workflow_execution_id_fkey" FOREIGN KEY ("workflow_execution_id") REFERENCES "public"."workflow_executions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."session_signer_permissions"
    ADD CONSTRAINT "session_signer_permissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id");



ALTER TABLE ONLY "public"."usage_metrics"
    ADD CONSTRAINT "usage_metrics_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_preferences"
    ADD CONSTRAINT "user_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."webhook_logs"
    ADD CONSTRAINT "webhook_logs_webhook_id_fkey" FOREIGN KEY ("webhook_id") REFERENCES "public"."workflow_webhooks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."webhook_logs"
    ADD CONSTRAINT "webhook_logs_workflow_execution_id_fkey" FOREIGN KEY ("workflow_execution_id") REFERENCES "public"."workflow_executions"("id");



ALTER TABLE ONLY "public"."workflow_executions"
    ADD CONSTRAINT "workflow_executions_triggered_by_fkey" FOREIGN KEY ("triggered_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."workflow_executions"
    ADD CONSTRAINT "workflow_executions_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workflow_schedules"
    ADD CONSTRAINT "workflow_schedules_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."workflow_schedules"
    ADD CONSTRAINT "workflow_schedules_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workflow_variables"
    ADD CONSTRAINT "workflow_variables_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."workflow_variables"
    ADD CONSTRAINT "workflow_variables_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workflow_versions"
    ADD CONSTRAINT "workflow_versions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."workflow_versions"
    ADD CONSTRAINT "workflow_versions_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workflow_webhooks"
    ADD CONSTRAINT "workflow_webhooks_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workflows"
    ADD CONSTRAINT "workflows_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."workflows"
    ADD CONSTRAINT "workflows_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



CREATE POLICY "Admins can modify org subscription" ON "public"."subscriptions" USING (("org_id" IN ( SELECT "organization_members"."organization_id"
   FROM "public"."organization_members"
  WHERE (("organization_members"."user_id" = "auth"."uid"()) AND ("organization_members"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



CREATE POLICY "Allow anonymous contact form submissions" ON "public"."contacts" FOR INSERT TO "anon" WITH CHECK (true);



CREATE POLICY "Allow anonymous insert" ON "public"."newsletter_subscribers" FOR INSERT WITH CHECK (true);



CREATE POLICY "Allow authenticated read" ON "public"."newsletter_subscribers" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Allow authenticated select" ON "public"."waitinglist" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Allow authenticated update" ON "public"."newsletter_subscribers" FOR UPDATE USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Allow authenticated update" ON "public"."waitinglist" FOR UPDATE USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Allow authenticated users to read contacts" ON "public"."contacts" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Allow public insert" ON "public"."waitinglist" FOR INSERT WITH CHECK (true);



CREATE POLICY "Anyone can view asset likes" ON "public"."asset_likes" FOR SELECT USING (true);



CREATE POLICY "Anyone can view bookmarks" ON "public"."bookmarks" FOR SELECT USING (true);



CREATE POLICY "Anyone can view contributor follows" ON "public"."contributor_follows" FOR SELECT USING (true);



CREATE POLICY "Anyone can view org follows" ON "public"."org_follows" FOR SELECT USING (true);



CREATE POLICY "Authenticated users can create assets" ON "public"."assets" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Authenticated users can create organizations" ON "public"."organizations" FOR INSERT WITH CHECK (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Authenticated users can create ratings" ON "public"."ratings" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Authenticated users can create runs" ON "public"."runs" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Categories are viewable by everyone" ON "public"."categories" FOR SELECT USING (true);



CREATE POLICY "Editors can create schedules" ON "public"."workflow_schedules" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."workflows" "w"
     JOIN "public"."organization_members" "om" ON (("om"."organization_id" = "w"."organization_id")))
  WHERE (("w"."id" = "workflow_schedules"."workflow_id") AND ("om"."user_id" = "auth"."uid"()) AND ("om"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'developer'::"text"]))))));



CREATE POLICY "Editors can create variables" ON "public"."workflow_variables" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."workflows" "w"
     JOIN "public"."organization_members" "om" ON (("om"."organization_id" = "w"."organization_id")))
  WHERE (("w"."id" = "workflow_variables"."workflow_id") AND ("om"."user_id" = "auth"."uid"()) AND ("om"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'developer'::"text"]))))));



CREATE POLICY "Editors can delete schedules" ON "public"."workflow_schedules" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM ("public"."workflows" "w"
     JOIN "public"."organization_members" "om" ON (("om"."organization_id" = "w"."organization_id")))
  WHERE (("w"."id" = "workflow_schedules"."workflow_id") AND ("om"."user_id" = "auth"."uid"()) AND ("om"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'developer'::"text"]))))));



CREATE POLICY "Editors can delete variables" ON "public"."workflow_variables" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM ("public"."workflows" "w"
     JOIN "public"."organization_members" "om" ON (("om"."organization_id" = "w"."organization_id")))
  WHERE (("w"."id" = "workflow_variables"."workflow_id") AND ("om"."user_id" = "auth"."uid"()) AND ("om"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'developer'::"text"]))))));



CREATE POLICY "Editors can update schedules" ON "public"."workflow_schedules" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM ("public"."workflows" "w"
     JOIN "public"."organization_members" "om" ON (("om"."organization_id" = "w"."organization_id")))
  WHERE (("w"."id" = "workflow_schedules"."workflow_id") AND ("om"."user_id" = "auth"."uid"()) AND ("om"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'developer'::"text"]))))));



CREATE POLICY "Editors can update variables" ON "public"."workflow_variables" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM ("public"."workflows" "w"
     JOIN "public"."organization_members" "om" ON (("om"."organization_id" = "w"."organization_id")))
  WHERE (("w"."id" = "workflow_variables"."workflow_id") AND ("om"."user_id" = "auth"."uid"()) AND ("om"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'developer'::"text"]))))));



CREATE POLICY "Org admins can delete org credentials" ON "public"."credentials" FOR DELETE USING (("organization_id" IN ( SELECT "organization_members"."organization_id"
   FROM "public"."organization_members"
  WHERE (("organization_members"."user_id" = "auth"."uid"()) AND ("organization_members"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



CREATE POLICY "Org admins can delete org workflows" ON "public"."workflows" FOR DELETE USING ((("organization_id" IS NOT NULL) AND ("organization_id" IN ( SELECT "organization_members"."organization_id"
   FROM "public"."organization_members"
  WHERE (("organization_members"."user_id" = "auth"."uid"()) AND ("organization_members"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"])))))));



CREATE POLICY "Org admins can update org credentials" ON "public"."credentials" FOR UPDATE USING (("organization_id" IN ( SELECT "organization_members"."organization_id"
   FROM "public"."organization_members"
  WHERE (("organization_members"."user_id" = "auth"."uid"()) AND ("organization_members"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



CREATE POLICY "Org admins can update org workflows" ON "public"."workflows" FOR UPDATE USING ((("organization_id" IS NOT NULL) AND ("organization_id" IN ( SELECT "organization_members"."organization_id"
   FROM "public"."organization_members"
  WHERE (("organization_members"."user_id" = "auth"."uid"()) AND ("organization_members"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"])))))));



CREATE POLICY "Org members can create org credentials" ON "public"."credentials" FOR INSERT WITH CHECK (("organization_id" IN ( SELECT "organization_members"."organization_id"
   FROM "public"."organization_members"
  WHERE (("organization_members"."user_id" = "auth"."uid"()) AND ("organization_members"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'developer'::"text"]))))));



CREATE POLICY "Org members can create org workflow versions" ON "public"."workflow_versions" FOR INSERT WITH CHECK (("workflow_id" IN ( SELECT "w"."id"
   FROM (("public"."workflows" "w"
     JOIN "public"."organizations" "o" ON (("w"."organization_id" = "o"."id")))
     JOIN "public"."organization_members" "om" ON (("o"."id" = "om"."organization_id")))
  WHERE (("om"."user_id" = "auth"."uid"()) AND ("om"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'developer'::"text"]))))));



CREATE POLICY "Org members can read org node execution data" ON "public"."node_execution_data" FOR SELECT USING (("execution_id" IN ( SELECT "workflow_executions"."id"
   FROM "public"."workflow_executions"
  WHERE ("workflow_executions"."workflow_id" IN ( SELECT "workflows"."id"
           FROM "public"."workflows"
          WHERE ("workflows"."organization_id" IN ( SELECT "organization_members"."organization_id"
                   FROM "public"."organization_members"
                  WHERE ("organization_members"."user_id" = "auth"."uid"()))))))));



CREATE POLICY "Org members can read org workflow executions" ON "public"."workflow_executions" FOR SELECT USING (("workflow_id" IN ( SELECT "workflows"."id"
   FROM "public"."workflows"
  WHERE ("workflows"."organization_id" IN ( SELECT "organization_members"."organization_id"
           FROM "public"."organization_members"
          WHERE ("organization_members"."user_id" = "auth"."uid"()))))));



CREATE POLICY "Org members can read org workflows" ON "public"."workflows" FOR SELECT USING ((("organization_id" IS NOT NULL) AND ("organization_id" IN ( SELECT "organization_members"."organization_id"
   FROM "public"."organization_members"
  WHERE ("organization_members"."user_id" = "auth"."uid"())))));



CREATE POLICY "Owners and members can create invite tokens" ON "public"."invite_tokens" FOR INSERT WITH CHECK (("organization_id" IN ( SELECT "organization_members"."organization_id"
   FROM "public"."organization_members"
  WHERE (("organization_members"."user_id" = "auth"."uid"()) AND ("organization_members"."role" = ANY (ARRAY['owner'::"text", 'member'::"text"]))))));



CREATE POLICY "Owners and members can update their org tokens" ON "public"."invite_tokens" FOR UPDATE USING (("organization_id" IN ( SELECT "organization_members"."organization_id"
   FROM "public"."organization_members"
  WHERE (("organization_members"."user_id" = "auth"."uid"()) AND ("organization_members"."role" = ANY (ARRAY['owner'::"text", 'member'::"text"]))))));



CREATE POLICY "Owners can delete members" ON "public"."organization_members" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."organization_members" "om"
  WHERE (("om"."organization_id" = "organization_members"."organization_id") AND ("om"."user_id" = "auth"."uid"()) AND ("om"."role" = 'owner'::"text")))));



CREATE POLICY "Owners can delete their organizations" ON "public"."organizations" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."organization_members"
  WHERE (("organization_members"."organization_id" = "organizations"."id") AND ("organization_members"."user_id" = "auth"."uid"()) AND ("organization_members"."role" = 'owner'::"text")))));



CREATE POLICY "Owners can insert members" ON "public"."organization_members" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."organization_members" "om"
  WHERE (("om"."organization_id" = "organization_members"."organization_id") AND ("om"."user_id" = "auth"."uid"()) AND ("om"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



CREATE POLICY "Owners can update members" ON "public"."organization_members" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."organization_members" "om"
  WHERE (("om"."organization_id" = "organization_members"."organization_id") AND ("om"."user_id" = "auth"."uid"()) AND ("om"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."organization_members" "om"
  WHERE (("om"."organization_id" = "organization_members"."organization_id") AND ("om"."user_id" = "auth"."uid"()) AND ("om"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



CREATE POLICY "Owners can update their organizations" ON "public"."organizations" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."organization_members"
  WHERE (("organization_members"."organization_id" = "organizations"."id") AND ("organization_members"."user_id" = "auth"."uid"()) AND ("organization_members"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."organization_members"
  WHERE (("organization_members"."organization_id" = "organizations"."id") AND ("organization_members"."user_id" = "auth"."uid"()) AND ("organization_members"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



CREATE POLICY "Plans are publicly readable" ON "public"."plans" FOR SELECT USING (("is_active" = true));



CREATE POLICY "Public assets are viewable by everyone" ON "public"."assets" FOR SELECT USING (("visibility" = 'PUBLIC'::"text"));



CREATE POLICY "Public can view organization members" ON "public"."organization_members" FOR SELECT USING (true);



CREATE POLICY "Public can view organizations" ON "public"."organizations" FOR SELECT USING (true);



CREATE POLICY "Ratings are viewable by everyone" ON "public"."ratings" FOR SELECT USING (true);



CREATE POLICY "Service can insert AI generations" ON "public"."ai_workflow_generations" FOR INSERT WITH CHECK (true);



CREATE POLICY "Service can update AI generations" ON "public"."ai_workflow_generations" FOR UPDATE USING (true);



CREATE POLICY "Service role can insert logs" ON "public"."schedule_execution_logs" FOR INSERT WITH CHECK (true);



CREATE POLICY "Service role can insert notifications" ON "public"."notifications" FOR INSERT WITH CHECK (true);



CREATE POLICY "Service role can manage payments" ON "public"."payments" USING ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text"));



CREATE POLICY "Service role can manage usage metrics" ON "public"."usage_metrics" USING ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text"));



CREATE POLICY "Service role has full access to session signers" ON "public"."session_signer_permissions" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Users can create credentials" ON "public"."credentials" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can create node execution data" ON "public"."node_execution_data" FOR INSERT WITH CHECK (("execution_id" IN ( SELECT "workflow_executions"."id"
   FROM "public"."workflow_executions"
  WHERE ("workflow_executions"."workflow_id" IN ( SELECT "workflows"."id"
           FROM "public"."workflows"
          WHERE ("workflows"."user_id" = "auth"."uid"()))))));



CREATE POLICY "Users can create own workflow versions" ON "public"."workflow_versions" FOR INSERT WITH CHECK (("workflow_id" IN ( SELECT "workflows"."id"
   FROM "public"."workflows"
  WHERE ("workflows"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can create their own bookmarks" ON "public"."bookmarks" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can create their own follows" ON "public"."contributor_follows" FOR INSERT WITH CHECK (("auth"."uid"() = "follower_id"));



CREATE POLICY "Users can create their own likes" ON "public"."asset_likes" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can create their own org follows" ON "public"."org_follows" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can create workflow executions" ON "public"."workflow_executions" FOR INSERT WITH CHECK (("workflow_id" IN ( SELECT "workflows"."id"
   FROM "public"."workflows"
  WHERE ("workflows"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can create workflows" ON "public"."workflows" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete credential usage" ON "public"."credential_usage" FOR DELETE USING (("credential_id" IN ( SELECT "credentials"."id"
   FROM "public"."credentials"
  WHERE ("credentials"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can delete own credentials" ON "public"."credentials" FOR DELETE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can delete own favorites" ON "public"."favorites" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete own notifications" ON "public"."notifications" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete own session signers" ON "public"."session_signer_permissions" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete own workflows" ON "public"."workflows" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete their own bookmarks" ON "public"."bookmarks" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete their own follows" ON "public"."contributor_follows" FOR DELETE USING (("auth"."uid"() = "follower_id"));



CREATE POLICY "Users can delete their own likes" ON "public"."asset_likes" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete their own org follows" ON "public"."org_follows" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own favorites" ON "public"."favorites" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own notification prefs" ON "public"."notification_preferences" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own preferences" ON "public"."user_preferences" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own session signers" ON "public"."session_signer_permissions" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their workflow executions" ON "public"."workflow_executions" FOR INSERT WITH CHECK (("workflow_id" IN ( SELECT "workflows"."id"
   FROM "public"."workflows"
  WHERE ("workflows"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can leave organizations" ON "public"."organization_members" FOR DELETE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can read own node execution data" ON "public"."node_execution_data" FOR SELECT USING (("execution_id" IN ( SELECT "workflow_executions"."id"
   FROM "public"."workflow_executions"
  WHERE ("workflow_executions"."workflow_id" IN ( SELECT "workflows"."id"
           FROM "public"."workflows"
          WHERE ("workflows"."user_id" = "auth"."uid"()))))));



CREATE POLICY "Users can read own workflow executions" ON "public"."workflow_executions" FOR SELECT USING (("workflow_id" IN ( SELECT "workflows"."id"
   FROM "public"."workflows"
  WHERE ("workflows"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can read own workflows" ON "public"."workflows" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can track credential usage" ON "public"."credential_usage" FOR INSERT WITH CHECK (("credential_id" IN ( SELECT "credentials"."id"
   FROM "public"."credentials"
  WHERE ("credentials"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can update node execution data" ON "public"."node_execution_data" FOR UPDATE USING (("execution_id" IN ( SELECT "workflow_executions"."id"
   FROM "public"."workflow_executions"
  WHERE ("workflow_executions"."workflow_id" IN ( SELECT "workflows"."id"
           FROM "public"."workflows"
          WHERE ("workflows"."user_id" = "auth"."uid"()))))));



CREATE POLICY "Users can update own credentials" ON "public"."credentials" FOR UPDATE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can update own favorites" ON "public"."favorites" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own notification prefs" ON "public"."notification_preferences" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own notifications" ON "public"."notifications" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own preferences" ON "public"."user_preferences" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own session signers" ON "public"."session_signer_permissions" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own workflows" ON "public"."workflows" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their workflow executions" ON "public"."workflow_executions" FOR UPDATE USING (("workflow_id" IN ( SELECT "workflows"."id"
   FROM "public"."workflows"
  WHERE ("workflows"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can update workflow executions" ON "public"."workflow_executions" FOR UPDATE USING (("workflow_id" IN ( SELECT "workflows"."id"
   FROM "public"."workflows"
  WHERE ("workflows"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can view credential usage" ON "public"."credential_usage" FOR SELECT USING (("credential_id" IN ( SELECT "credentials"."id"
   FROM "public"."credentials"
  WHERE ("credentials"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can view invite tokens for their orgs" ON "public"."invite_tokens" FOR SELECT USING (("organization_id" IN ( SELECT "organization_members"."organization_id"
   FROM "public"."organization_members"
  WHERE ("organization_members"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can view org credentials" ON "public"."credentials" FOR SELECT USING (("organization_id" IN ( SELECT "organization_members"."organization_id"
   FROM "public"."organization_members"
  WHERE ("organization_members"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can view org payments" ON "public"."payments" FOR SELECT USING (("org_id" IN ( SELECT "organization_members"."organization_id"
   FROM "public"."organization_members"
  WHERE ("organization_members"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can view org subscription" ON "public"."subscriptions" FOR SELECT USING (("org_id" IN ( SELECT "organization_members"."organization_id"
   FROM "public"."organization_members"
  WHERE ("organization_members"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can view org usage" ON "public"."usage_metrics" FOR SELECT USING (("org_id" IN ( SELECT "organization_members"."organization_id"
   FROM "public"."organization_members"
  WHERE ("organization_members"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can view org workflow versions" ON "public"."workflow_versions" FOR SELECT USING (("workflow_id" IN ( SELECT "w"."id"
   FROM (("public"."workflows" "w"
     JOIN "public"."organizations" "o" ON (("w"."organization_id" = "o"."id")))
     JOIN "public"."organization_members" "om" ON (("o"."id" = "om"."organization_id")))
  WHERE ("om"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can view own credentials" ON "public"."credentials" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can view own favorites" ON "public"."favorites" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own notification prefs" ON "public"."notification_preferences" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own notifications" ON "public"."notifications" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own preferences" ON "public"."user_preferences" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own session signers" ON "public"."session_signer_permissions" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own workflow versions" ON "public"."workflow_versions" FOR SELECT USING (("workflow_id" IN ( SELECT "workflows"."id"
   FROM "public"."workflows"
  WHERE ("workflows"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can view schedule logs in their orgs" ON "public"."schedule_execution_logs" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (("public"."workflow_schedules" "ws"
     JOIN "public"."workflows" "w" ON (("w"."id" = "ws"."workflow_id")))
     JOIN "public"."organization_members" "om" ON (("om"."organization_id" = "w"."organization_id")))
  WHERE (("ws"."id" = "schedule_execution_logs"."schedule_id") AND ("om"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can view schedules in their orgs" ON "public"."workflow_schedules" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."workflows" "w"
     JOIN "public"."organization_members" "om" ON (("om"."organization_id" = "w"."organization_id")))
  WHERE (("w"."id" = "workflow_schedules"."workflow_id") AND ("om"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can view their AI generations" ON "public"."ai_workflow_generations" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can view their own runs" ON "public"."runs" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their workflow executions" ON "public"."workflow_executions" FOR SELECT USING (("workflow_id" IN ( SELECT "workflows"."id"
   FROM "public"."workflows"
  WHERE ("workflows"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can view variables in their orgs" ON "public"."workflow_variables" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."workflows" "w"
     JOIN "public"."organization_members" "om" ON (("om"."organization_id" = "w"."organization_id")))
  WHERE (("w"."id" = "workflow_variables"."workflow_id") AND ("om"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."agents" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "agents_org_isolation" ON "public"."agents" USING (("org_id" IN ( SELECT "organization_members"."organization_id"
   FROM "public"."organization_members"
  WHERE ("organization_members"."user_id" = "auth"."uid"()))));



CREATE POLICY "agents_scope_isolation" ON "public"."agents" USING ((("org_id" = "public"."get_session_var"('org'::"text")) AND ("project_id" = "public"."get_session_var"('project'::"text")) AND ("env_id" = "public"."get_session_var"('env'::"text"))));



ALTER TABLE "public"."ai_workflow_generations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."app_agents" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "app_agents_via_app" ON "public"."app_agents" USING (("app_id" IN ( SELECT "a"."id"
   FROM ("public"."apps" "a"
     JOIN "public"."organization_members" "om" ON (("a"."org_id" = "om"."organization_id")))
  WHERE ("om"."user_id" = "auth"."uid"()))));



ALTER TABLE "public"."apps" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "apps_org_isolation" ON "public"."apps" USING (("org_id" IN ( SELECT "organization_members"."organization_id"
   FROM "public"."organization_members"
  WHERE ("organization_members"."user_id" = "auth"."uid"()))));



ALTER TABLE "public"."asset_likes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."assets" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."bookmarks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."categories" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contacts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contributor_follows" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."credential_usage" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."credentials" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."environments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "environments_project_isolation" ON "public"."environments" USING (("project_id" IN ( SELECT "p"."id"
   FROM ("public"."projects" "p"
     JOIN "public"."organization_members" "om" ON (("p"."org_id" = "om"."organization_id")))
  WHERE ("om"."user_id" = "auth"."uid"()))));



ALTER TABLE "public"."favorites" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."invite_tokens" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."newsletter_subscribers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "no_public_read_identity_links" ON "public"."identity_links" FOR SELECT USING (false);



CREATE POLICY "no_public_read_wallets" ON "public"."user_wallets" FOR SELECT USING (false);



ALTER TABLE "public"."node_execution_data" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."org_follows" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."org_invites" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "org_invites_create" ON "public"."org_invites" FOR INSERT WITH CHECK ((("org_id" IN ( SELECT "organization_members"."organization_id"
   FROM "public"."organization_members"
  WHERE (("organization_members"."user_id" = "auth"."uid"()) AND ("organization_members"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'member'::"text"]))))) AND ("inviter_id" = "auth"."uid"())));



CREATE POLICY "org_invites_read" ON "public"."org_invites" FOR SELECT USING (("org_id" IN ( SELECT "organization_members"."organization_id"
   FROM "public"."organization_members"
  WHERE (("organization_members"."user_id" = "auth"."uid"()) AND ("organization_members"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'member'::"text"]))))));



CREATE POLICY "org_invites_update" ON "public"."org_invites" FOR UPDATE USING (("org_id" IN ( SELECT "organization_members"."organization_id"
   FROM "public"."organization_members"
  WHERE (("organization_members"."user_id" = "auth"."uid"()) AND ("organization_members"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'member'::"text"]))))));



ALTER TABLE "public"."payments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."plans" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."projects" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "projects_org_isolation" ON "public"."projects" USING (("org_id" IN ( SELECT "organization_members"."organization_id"
   FROM "public"."organization_members"
  WHERE ("organization_members"."user_id" = "auth"."uid"()))));



ALTER TABLE "public"."ratings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."runs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."schedule_execution_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."session_signer_permissions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."subscriptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."usage_metrics" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_preferences" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."waitinglist" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "webhook_access_policy" ON "public"."workflow_webhooks" USING (("workflow_id" IN ( SELECT "workflows"."id"
   FROM "public"."workflows"
  WHERE ("workflows"."organization_id" IN ( SELECT "organization_members"."organization_id"
           FROM "public"."organization_members"
          WHERE ("organization_members"."user_id" = "auth"."uid"()))))));



ALTER TABLE "public"."webhook_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "webhook_logs_access_policy" ON "public"."webhook_logs" USING (("webhook_id" IN ( SELECT "workflow_webhooks"."id"
   FROM "public"."workflow_webhooks"
  WHERE ("workflow_webhooks"."workflow_id" IN ( SELECT "workflows"."id"
           FROM "public"."workflows"
          WHERE ("workflows"."organization_id" IN ( SELECT "organization_members"."organization_id"
                   FROM "public"."organization_members"
                  WHERE ("organization_members"."user_id" = "auth"."uid"()))))))));



ALTER TABLE "public"."workflow_executions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."workflow_schedules" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."workflow_variables" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."workflow_versions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."workflow_webhooks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."workflows" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."citextin"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."citextin"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."citextin"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."citextin"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."citextout"("public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."citextout"("public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."citextout"("public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."citextout"("public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."citextrecv"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."citextrecv"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."citextrecv"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."citextrecv"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."citextsend"("public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."citextsend"("public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."citextsend"("public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."citextsend"("public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."citext"(boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."citext"(boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."citext"(boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."citext"(boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."citext"(character) TO "postgres";
GRANT ALL ON FUNCTION "public"."citext"(character) TO "anon";
GRANT ALL ON FUNCTION "public"."citext"(character) TO "authenticated";
GRANT ALL ON FUNCTION "public"."citext"(character) TO "service_role";



GRANT ALL ON FUNCTION "public"."citext"("inet") TO "postgres";
GRANT ALL ON FUNCTION "public"."citext"("inet") TO "anon";
GRANT ALL ON FUNCTION "public"."citext"("inet") TO "authenticated";
GRANT ALL ON FUNCTION "public"."citext"("inet") TO "service_role";

























































































































































GRANT ALL ON FUNCTION "public"."auto_create_personal_workspace"() TO "anon";
GRANT ALL ON FUNCTION "public"."auto_create_personal_workspace"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."auto_create_personal_workspace"() TO "service_role";



GRANT ALL ON FUNCTION "public"."auto_version_workflow"() TO "anon";
GRANT ALL ON FUNCTION "public"."auto_version_workflow"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."auto_version_workflow"() TO "service_role";



GRANT ALL ON FUNCTION "public"."calculate_next_run"("cron_expr" "text", "tz" "text", "from_time" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."calculate_next_run"("cron_expr" "text", "tz" "text", "from_time" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_next_run"("cron_expr" "text", "tz" "text", "from_time" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."check_single_personal_workspace"() TO "anon";
GRANT ALL ON FUNCTION "public"."check_single_personal_workspace"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_single_personal_workspace"() TO "service_role";



GRANT ALL ON FUNCTION "public"."check_usage_limit"("p_org_id" "uuid", "p_metric_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."check_usage_limit"("p_org_id" "uuid", "p_metric_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_usage_limit"("p_org_id" "uuid", "p_metric_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."citext_cmp"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."citext_cmp"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."citext_cmp"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."citext_cmp"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."citext_eq"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."citext_eq"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."citext_eq"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."citext_eq"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."citext_ge"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."citext_ge"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."citext_ge"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."citext_ge"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."citext_gt"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."citext_gt"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."citext_gt"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."citext_gt"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."citext_hash"("public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."citext_hash"("public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."citext_hash"("public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."citext_hash"("public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."citext_hash_extended"("public"."citext", bigint) TO "postgres";
GRANT ALL ON FUNCTION "public"."citext_hash_extended"("public"."citext", bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."citext_hash_extended"("public"."citext", bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."citext_hash_extended"("public"."citext", bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."citext_larger"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."citext_larger"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."citext_larger"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."citext_larger"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."citext_le"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."citext_le"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."citext_le"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."citext_le"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."citext_lt"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."citext_lt"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."citext_lt"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."citext_lt"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."citext_ne"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."citext_ne"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."citext_ne"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."citext_ne"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."citext_pattern_cmp"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."citext_pattern_cmp"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."citext_pattern_cmp"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."citext_pattern_cmp"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."citext_pattern_ge"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."citext_pattern_ge"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."citext_pattern_ge"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."citext_pattern_ge"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."citext_pattern_gt"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."citext_pattern_gt"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."citext_pattern_gt"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."citext_pattern_gt"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."citext_pattern_le"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."citext_pattern_le"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."citext_pattern_le"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."citext_pattern_le"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."citext_pattern_lt"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."citext_pattern_lt"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."citext_pattern_lt"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."citext_pattern_lt"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."citext_smaller"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."citext_smaller"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."citext_smaller"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."citext_smaller"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."cleanup_old_ai_generations"() TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_old_ai_generations"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_old_ai_generations"() TO "service_role";



GRANT ALL ON FUNCTION "public"."cleanup_old_executions"() TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_old_executions"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_old_executions"() TO "service_role";



GRANT ALL ON FUNCTION "public"."create_default_notification_prefs"() TO "anon";
GRANT ALL ON FUNCTION "public"."create_default_notification_prefs"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_default_notification_prefs"() TO "service_role";



GRANT ALL ON FUNCTION "public"."create_default_project_and_env"() TO "anon";
GRANT ALL ON FUNCTION "public"."create_default_project_and_env"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_default_project_and_env"() TO "service_role";



GRANT ALL ON FUNCTION "public"."create_workflow_version"("p_workflow_id" "uuid", "p_created_by" "uuid", "p_is_auto_save" boolean, "p_change_summary" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_workflow_version"("p_workflow_id" "uuid", "p_created_by" "uuid", "p_is_auto_save" boolean, "p_change_summary" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_workflow_version"("p_workflow_id" "uuid", "p_created_by" "uuid", "p_is_auto_save" boolean, "p_change_summary" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_webhook_api_key"() TO "anon";
GRANT ALL ON FUNCTION "public"."generate_webhook_api_key"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_webhook_api_key"() TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_webhook_path"() TO "anon";
GRANT ALL ON FUNCTION "public"."generate_webhook_path"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_webhook_path"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_current_usage"("p_org_id" "uuid", "p_metric_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_current_usage"("p_org_id" "uuid", "p_metric_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_current_usage"("p_org_id" "uuid", "p_metric_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_current_workspace"("p_user_id" "uuid", "p_org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_current_workspace"("p_user_id" "uuid", "p_org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_current_workspace"("p_user_id" "uuid", "p_org_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_default_env_id"("project_uuid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_default_env_id"("project_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_default_env_id"("project_uuid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_default_project_id"("org_uuid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_default_project_id"("org_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_default_project_id"("org_uuid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_invite_details"("p_token" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_invite_details"("p_token" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_invite_details"("p_token" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_next_version_number"("p_workflow_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_next_version_number"("p_workflow_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_next_version_number"("p_workflow_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_org_subscription"("p_org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_org_subscription"("p_org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_org_subscription"("p_org_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_session_var"("var_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_session_var"("var_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_session_var"("var_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_favorites"("p_user_id" "uuid", "p_org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_favorites"("p_user_id" "uuid", "p_org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_favorites"("p_user_id" "uuid", "p_org_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_preferences"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_preferences"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_preferences"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_workspace"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_workspace"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_workspace"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_workflow_stats"("workflow_uuid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_workflow_stats"("workflow_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_workflow_stats"("workflow_uuid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_exists"("handle_to_check" "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."handle_exists"("handle_to_check" "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_exists"("handle_to_check" "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_usage_metric"("p_org_id" "uuid", "p_metric_name" "text", "p_amount" integer, "p_period_start" timestamp with time zone, "p_period_end" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."increment_usage_metric"("p_org_id" "uuid", "p_metric_name" "text", "p_amount" integer, "p_period_start" timestamp with time zone, "p_period_end" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_usage_metric"("p_org_id" "uuid", "p_metric_name" "text", "p_amount" integer, "p_period_start" timestamp with time zone, "p_period_end" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."mark_expired_invites"() TO "anon";
GRANT ALL ON FUNCTION "public"."mark_expired_invites"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_expired_invites"() TO "service_role";



GRANT ALL ON FUNCTION "public"."prevent_project_deletion_with_resources"() TO "anon";
GRANT ALL ON FUNCTION "public"."prevent_project_deletion_with_resources"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_project_deletion_with_resources"() TO "service_role";



GRANT ALL ON FUNCTION "public"."regexp_match"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."regexp_match"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."regexp_match"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."regexp_match"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."regexp_match"("public"."citext", "public"."citext", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."regexp_match"("public"."citext", "public"."citext", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."regexp_match"("public"."citext", "public"."citext", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."regexp_match"("public"."citext", "public"."citext", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."regexp_matches"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."regexp_matches"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."regexp_matches"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."regexp_matches"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."regexp_matches"("public"."citext", "public"."citext", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."regexp_matches"("public"."citext", "public"."citext", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."regexp_matches"("public"."citext", "public"."citext", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."regexp_matches"("public"."citext", "public"."citext", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."regexp_replace"("public"."citext", "public"."citext", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."regexp_replace"("public"."citext", "public"."citext", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."regexp_replace"("public"."citext", "public"."citext", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."regexp_replace"("public"."citext", "public"."citext", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."regexp_replace"("public"."citext", "public"."citext", "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."regexp_replace"("public"."citext", "public"."citext", "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."regexp_replace"("public"."citext", "public"."citext", "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."regexp_replace"("public"."citext", "public"."citext", "text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."regexp_split_to_array"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."regexp_split_to_array"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."regexp_split_to_array"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."regexp_split_to_array"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."regexp_split_to_array"("public"."citext", "public"."citext", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."regexp_split_to_array"("public"."citext", "public"."citext", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."regexp_split_to_array"("public"."citext", "public"."citext", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."regexp_split_to_array"("public"."citext", "public"."citext", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."regexp_split_to_table"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."regexp_split_to_table"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."regexp_split_to_table"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."regexp_split_to_table"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."regexp_split_to_table"("public"."citext", "public"."citext", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."regexp_split_to_table"("public"."citext", "public"."citext", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."regexp_split_to_table"("public"."citext", "public"."citext", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."regexp_split_to_table"("public"."citext", "public"."citext", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."reorder_favorites"("p_user_id" "uuid", "p_org_id" "uuid", "p_favorite_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."reorder_favorites"("p_user_id" "uuid", "p_org_id" "uuid", "p_favorite_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."reorder_favorites"("p_user_id" "uuid", "p_org_id" "uuid", "p_favorite_ids" "uuid"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."replace"("public"."citext", "public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."replace"("public"."citext", "public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."replace"("public"."citext", "public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."replace"("public"."citext", "public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."restore_workflow_version"("p_workflow_id" "uuid", "p_version_id" "uuid", "p_restored_by" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."restore_workflow_version"("p_workflow_id" "uuid", "p_version_id" "uuid", "p_restored_by" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."restore_workflow_version"("p_workflow_id" "uuid", "p_version_id" "uuid", "p_restored_by" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_workspace_scope"("p_org_id" "uuid", "p_project_id" "uuid", "p_env_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."set_workspace_scope"("p_org_id" "uuid", "p_project_id" "uuid", "p_env_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_workspace_scope"("p_org_id" "uuid", "p_project_id" "uuid", "p_env_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."split_part"("public"."citext", "public"."citext", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."split_part"("public"."citext", "public"."citext", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."split_part"("public"."citext", "public"."citext", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."split_part"("public"."citext", "public"."citext", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."strpos"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."strpos"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."strpos"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strpos"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_org_id_columns"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_org_id_columns"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_org_id_columns"() TO "service_role";



GRANT ALL ON FUNCTION "public"."texticlike"("public"."citext", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."texticlike"("public"."citext", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."texticlike"("public"."citext", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."texticlike"("public"."citext", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."texticlike"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."texticlike"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."texticlike"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."texticlike"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."texticnlike"("public"."citext", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."texticnlike"("public"."citext", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."texticnlike"("public"."citext", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."texticnlike"("public"."citext", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."texticnlike"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."texticnlike"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."texticnlike"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."texticnlike"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."texticregexeq"("public"."citext", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."texticregexeq"("public"."citext", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."texticregexeq"("public"."citext", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."texticregexeq"("public"."citext", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."texticregexeq"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."texticregexeq"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."texticregexeq"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."texticregexeq"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."texticregexne"("public"."citext", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."texticregexne"("public"."citext", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."texticregexne"("public"."citext", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."texticregexne"("public"."citext", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."texticregexne"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."texticregexne"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."texticregexne"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."texticregexne"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."translate"("public"."citext", "public"."citext", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."translate"("public"."citext", "public"."citext", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."translate"("public"."citext", "public"."citext", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."translate"("public"."citext", "public"."citext", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_credentials_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_credentials_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_credentials_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_invite_token_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_invite_token_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_invite_token_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_newsletter_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_newsletter_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_newsletter_updated_at_column"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_node_execution_data_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_node_execution_data_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_node_execution_data_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_schedule_next_run"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_schedule_next_run"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_schedule_next_run"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_schedule_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_schedule_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_schedule_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_variable_is_secret"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_variable_is_secret"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_variable_is_secret"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_variable_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_variable_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_variable_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_webhook_timestamp"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_webhook_timestamp"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_webhook_timestamp"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_workflows_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_workflows_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_workflows_updated_at"() TO "service_role";












GRANT ALL ON FUNCTION "public"."max"("public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."max"("public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."max"("public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."max"("public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."min"("public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."min"("public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."min"("public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."min"("public"."citext") TO "service_role";









GRANT ALL ON TABLE "public"."agents" TO "anon";
GRANT ALL ON TABLE "public"."agents" TO "authenticated";
GRANT ALL ON TABLE "public"."agents" TO "service_role";



GRANT ALL ON TABLE "public"."agents_active" TO "anon";
GRANT ALL ON TABLE "public"."agents_active" TO "authenticated";
GRANT ALL ON TABLE "public"."agents_active" TO "service_role";



GRANT ALL ON TABLE "public"."ai_workflow_generations" TO "anon";
GRANT ALL ON TABLE "public"."ai_workflow_generations" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_workflow_generations" TO "service_role";



GRANT ALL ON TABLE "public"."app_agents" TO "anon";
GRANT ALL ON TABLE "public"."app_agents" TO "authenticated";
GRANT ALL ON TABLE "public"."app_agents" TO "service_role";



GRANT ALL ON TABLE "public"."apps" TO "anon";
GRANT ALL ON TABLE "public"."apps" TO "authenticated";
GRANT ALL ON TABLE "public"."apps" TO "service_role";



GRANT ALL ON TABLE "public"."asset_categories" TO "anon";
GRANT ALL ON TABLE "public"."asset_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."asset_categories" TO "service_role";



GRANT ALL ON TABLE "public"."asset_likes" TO "anon";
GRANT ALL ON TABLE "public"."asset_likes" TO "authenticated";
GRANT ALL ON TABLE "public"."asset_likes" TO "service_role";



GRANT ALL ON TABLE "public"."assets" TO "anon";
GRANT ALL ON TABLE "public"."assets" TO "authenticated";
GRANT ALL ON TABLE "public"."assets" TO "service_role";



GRANT ALL ON TABLE "public"."bookmarks" TO "anon";
GRANT ALL ON TABLE "public"."bookmarks" TO "authenticated";
GRANT ALL ON TABLE "public"."bookmarks" TO "service_role";



GRANT ALL ON TABLE "public"."categories" TO "anon";
GRANT ALL ON TABLE "public"."categories" TO "authenticated";
GRANT ALL ON TABLE "public"."categories" TO "service_role";



GRANT ALL ON TABLE "public"."contacts" TO "anon";
GRANT ALL ON TABLE "public"."contacts" TO "authenticated";
GRANT ALL ON TABLE "public"."contacts" TO "service_role";



GRANT ALL ON TABLE "public"."contributor_follows" TO "anon";
GRANT ALL ON TABLE "public"."contributor_follows" TO "authenticated";
GRANT ALL ON TABLE "public"."contributor_follows" TO "service_role";



GRANT ALL ON TABLE "public"."credential_usage" TO "anon";
GRANT ALL ON TABLE "public"."credential_usage" TO "authenticated";
GRANT ALL ON TABLE "public"."credential_usage" TO "service_role";



GRANT ALL ON TABLE "public"."credentials" TO "anon";
GRANT ALL ON TABLE "public"."credentials" TO "authenticated";
GRANT ALL ON TABLE "public"."credentials" TO "service_role";



GRANT ALL ON TABLE "public"."email_suppressions" TO "anon";
GRANT ALL ON TABLE "public"."email_suppressions" TO "authenticated";
GRANT ALL ON TABLE "public"."email_suppressions" TO "service_role";



GRANT ALL ON TABLE "public"."emails" TO "anon";
GRANT ALL ON TABLE "public"."emails" TO "authenticated";
GRANT ALL ON TABLE "public"."emails" TO "service_role";



GRANT ALL ON TABLE "public"."environments" TO "anon";
GRANT ALL ON TABLE "public"."environments" TO "authenticated";
GRANT ALL ON TABLE "public"."environments" TO "service_role";



GRANT ALL ON TABLE "public"."environments_active" TO "anon";
GRANT ALL ON TABLE "public"."environments_active" TO "authenticated";
GRANT ALL ON TABLE "public"."environments_active" TO "service_role";



GRANT ALL ON TABLE "public"."favorites" TO "anon";
GRANT ALL ON TABLE "public"."favorites" TO "authenticated";
GRANT ALL ON TABLE "public"."favorites" TO "service_role";



GRANT ALL ON TABLE "public"."identity_links" TO "anon";
GRANT ALL ON TABLE "public"."identity_links" TO "authenticated";
GRANT ALL ON TABLE "public"."identity_links" TO "service_role";



GRANT ALL ON TABLE "public"."invite_tokens" TO "anon";
GRANT ALL ON TABLE "public"."invite_tokens" TO "authenticated";
GRANT ALL ON TABLE "public"."invite_tokens" TO "service_role";



GRANT ALL ON TABLE "public"."newsletter_subscribers" TO "anon";
GRANT ALL ON TABLE "public"."newsletter_subscribers" TO "authenticated";
GRANT ALL ON TABLE "public"."newsletter_subscribers" TO "service_role";



GRANT ALL ON TABLE "public"."node_execution_data" TO "anon";
GRANT ALL ON TABLE "public"."node_execution_data" TO "authenticated";
GRANT ALL ON TABLE "public"."node_execution_data" TO "service_role";



GRANT ALL ON TABLE "public"."notification_preferences" TO "anon";
GRANT ALL ON TABLE "public"."notification_preferences" TO "authenticated";
GRANT ALL ON TABLE "public"."notification_preferences" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON TABLE "public"."org_follows" TO "anon";
GRANT ALL ON TABLE "public"."org_follows" TO "authenticated";
GRANT ALL ON TABLE "public"."org_follows" TO "service_role";



GRANT ALL ON TABLE "public"."org_invites" TO "anon";
GRANT ALL ON TABLE "public"."org_invites" TO "authenticated";
GRANT ALL ON TABLE "public"."org_invites" TO "service_role";



GRANT ALL ON TABLE "public"."organization_members" TO "anon";
GRANT ALL ON TABLE "public"."organization_members" TO "authenticated";
GRANT ALL ON TABLE "public"."organization_members" TO "service_role";



GRANT ALL ON TABLE "public"."organizations" TO "anon";
GRANT ALL ON TABLE "public"."organizations" TO "authenticated";
GRANT ALL ON TABLE "public"."organizations" TO "service_role";



GRANT ALL ON TABLE "public"."payments" TO "anon";
GRANT ALL ON TABLE "public"."payments" TO "authenticated";
GRANT ALL ON TABLE "public"."payments" TO "service_role";



GRANT ALL ON TABLE "public"."plans" TO "anon";
GRANT ALL ON TABLE "public"."plans" TO "authenticated";
GRANT ALL ON TABLE "public"."plans" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."projects" TO "anon";
GRANT ALL ON TABLE "public"."projects" TO "authenticated";
GRANT ALL ON TABLE "public"."projects" TO "service_role";



GRANT ALL ON TABLE "public"."projects_active" TO "anon";
GRANT ALL ON TABLE "public"."projects_active" TO "authenticated";
GRANT ALL ON TABLE "public"."projects_active" TO "service_role";



GRANT ALL ON TABLE "public"."ratings" TO "anon";
GRANT ALL ON TABLE "public"."ratings" TO "authenticated";
GRANT ALL ON TABLE "public"."ratings" TO "service_role";



GRANT ALL ON TABLE "public"."runs" TO "anon";
GRANT ALL ON TABLE "public"."runs" TO "authenticated";
GRANT ALL ON TABLE "public"."runs" TO "service_role";



GRANT ALL ON TABLE "public"."schedule_execution_logs" TO "anon";
GRANT ALL ON TABLE "public"."schedule_execution_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."schedule_execution_logs" TO "service_role";



GRANT ALL ON TABLE "public"."session_signer_permissions" TO "anon";
GRANT ALL ON TABLE "public"."session_signer_permissions" TO "authenticated";
GRANT ALL ON TABLE "public"."session_signer_permissions" TO "service_role";



GRANT ALL ON TABLE "public"."subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."subscriptions" TO "service_role";



GRANT ALL ON TABLE "public"."usage_metrics" TO "anon";
GRANT ALL ON TABLE "public"."usage_metrics" TO "authenticated";
GRANT ALL ON TABLE "public"."usage_metrics" TO "service_role";



GRANT ALL ON TABLE "public"."user_preferences" TO "anon";
GRANT ALL ON TABLE "public"."user_preferences" TO "authenticated";
GRANT ALL ON TABLE "public"."user_preferences" TO "service_role";



GRANT ALL ON TABLE "public"."user_wallets" TO "anon";
GRANT ALL ON TABLE "public"."user_wallets" TO "authenticated";
GRANT ALL ON TABLE "public"."user_wallets" TO "service_role";



GRANT ALL ON TABLE "public"."waitinglist" TO "anon";
GRANT ALL ON TABLE "public"."waitinglist" TO "authenticated";
GRANT ALL ON TABLE "public"."waitinglist" TO "service_role";



GRANT ALL ON TABLE "public"."webhook_logs" TO "anon";
GRANT ALL ON TABLE "public"."webhook_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."webhook_logs" TO "service_role";



GRANT ALL ON TABLE "public"."workflow_executions" TO "anon";
GRANT ALL ON TABLE "public"."workflow_executions" TO "authenticated";
GRANT ALL ON TABLE "public"."workflow_executions" TO "service_role";



GRANT ALL ON TABLE "public"."workflow_schedules" TO "anon";
GRANT ALL ON TABLE "public"."workflow_schedules" TO "authenticated";
GRANT ALL ON TABLE "public"."workflow_schedules" TO "service_role";



GRANT ALL ON TABLE "public"."workflow_variables" TO "anon";
GRANT ALL ON TABLE "public"."workflow_variables" TO "authenticated";
GRANT ALL ON TABLE "public"."workflow_variables" TO "service_role";



GRANT ALL ON TABLE "public"."workflow_versions" TO "anon";
GRANT ALL ON TABLE "public"."workflow_versions" TO "authenticated";
GRANT ALL ON TABLE "public"."workflow_versions" TO "service_role";



GRANT ALL ON TABLE "public"."workflow_webhooks" TO "anon";
GRANT ALL ON TABLE "public"."workflow_webhooks" TO "authenticated";
GRANT ALL ON TABLE "public"."workflow_webhooks" TO "service_role";



GRANT ALL ON TABLE "public"."workflows" TO "anon";
GRANT ALL ON TABLE "public"."workflows" TO "authenticated";
GRANT ALL ON TABLE "public"."workflows" TO "service_role";



GRANT ALL ON TABLE "public"."workspace_stats" TO "anon";
GRANT ALL ON TABLE "public"."workspace_stats" TO "authenticated";
GRANT ALL ON TABLE "public"."workspace_stats" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































