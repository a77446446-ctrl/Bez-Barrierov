-- Fix RLS policy to allow Executors to reject orders (set executor_id to NULL)

-- 1. Drop existing restrictive policies on orders if necessary
-- (This part depends on existing policy names, so we use IF EXISTS or generic approach)

-- 2. Create policy to allow Executors to update orders assigned to them
-- This policy allows updating rows where the user is currently the executor
-- It is crucial that this policy allows the update even if the new row has executor_id = NULL

CREATE POLICY "Executors can update own orders"
ON "public"."orders"
FOR UPDATE
USING (
  auth.uid() = executor_id
)
WITH CHECK (
  -- Allow updating to NULL (rejecting) or keeping assigned (status updates)
  (executor_id IS NULL) OR (executor_id = auth.uid())
);

-- Alternatively, if you want to allow them to update status without restrictions on new row state:
-- DROP POLICY IF EXISTS "Executors can update own orders" ON "public"."orders";
-- CREATE POLICY "Executors can update own orders" ON "public"."orders" FOR UPDATE USING (auth.uid() = executor_id);
