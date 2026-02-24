-- Enable RLS
alter table "public"."orders" enable row level security;

-- Drop existing policies to avoid conflicts
drop policy if exists "Executors can see all open orders" on "public"."orders";
drop policy if exists "Executors can see their own orders" on "public"."orders";
drop policy if exists "Executors can update their own orders" on "public"."orders";

-- Policy 1: Executors can see ALL open orders (regardless of executor_id)
create policy "Executors can see all open orders"
on "public"."orders"
for select
to authenticated
using (
  (auth.uid() in ( select id from profiles where role = 'executor' ))
  and
  (status = 'open')
);

-- Policy 2: Executors can see orders assigned to them
create policy "Executors can see their own orders"
on "public"."orders"
for select
to authenticated
using (
  executor_id = auth.uid()
);

-- Policy 3: Executors can update orders assigned to them (including rejecting/reopening)
-- This allows setting executor_id to NULL and status to OPEN
create policy "Executors can update their own orders"
on "public"."orders"
for update
to authenticated
using (
  executor_id = auth.uid()
)
with check (
  (executor_id = auth.uid()) 
  or 
  (executor_id is null and status = 'open')
);

-- Policy 4: Allow executors to insert responses (if needed, usually handled by separate table or array update)
-- Assuming responses is a column in orders, the update policy covers it.

