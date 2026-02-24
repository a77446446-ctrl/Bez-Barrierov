-- Fix: Allow executors to see open orders even if they have a subscription
-- Currently, subscribed executors might be restricted from seeing the general pool of open orders.
-- This script adds a policy to explicitly allow viewing ALL open orders.

-- 1. Policy to allow viewing OPEN orders
CREATE POLICY "Executors can view all open orders"
ON "public"."orders"
FOR SELECT
USING (
  status = 'OPEN'
);

-- 2. Policy to allow viewing orders assigned to the user
CREATE POLICY "Executors can view own assigned orders"
ON "public"."orders"
FOR SELECT
USING (
  executor_id = auth.uid()
);
