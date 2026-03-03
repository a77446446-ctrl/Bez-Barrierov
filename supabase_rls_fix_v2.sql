-- 1. Сброс старых политик (удаляем, чтобы избежать конфликтов)
drop policy if exists "Executors can see all open orders" on "public"."orders";
drop policy if exists "Executors can see their own orders" on "public"."orders";
drop policy if exists "Executors can update their own orders" on "public"."orders";
drop policy if exists "Customers can see their own orders" on "public"."orders";
drop policy if exists "Enable read access for all users" on "public"."orders";
drop policy if exists "Enable insert for authenticated users only" on "public"."orders";
drop policy if exists "Enable update for users based on email" on "public"."orders";

-- 2. Убеждаемся, что RLS включен
alter table "public"."orders" enable row level security;

-- 3. ПОЛИТИКА 1: Исполнители видят ВСЕ заказы со статусом 'open'
-- Это решает проблему, когда исполнитель не видит свободные заказы
create policy "Executors can see all open orders"
on "public"."orders"
for select
to authenticated
using (
  -- Проверяем, что текущий пользователь - исполнитель
  exists (
    select 1 from profiles
    where profiles.id = auth.uid()
    and profiles.role = 'EXECUTOR'
  )
  and
  status = 'OPEN'
);

-- 4. ПОЛИТИКА 2: Исполнители видят заказы, назначенные ИМ (взятые в работу)
create policy "Executors can see their own orders"
on "public"."orders"
for select
to authenticated
using (
  executor_id = auth.uid()
);

-- 5. ПОЛИТИКА 3: Исполнители могут обновлять заказы
-- (брать в работу или отказываться от них)
create policy "Executors can update their own orders"
on "public"."orders"
for update
to authenticated
using (
  -- Можно обновлять, если ты уже исполнитель ИЛИ заказ свободен (чтобы взять его)
  executor_id = auth.uid() 
  or 
  (executor_id is null and status = 'OPEN')
)
with check (
  executor_id = auth.uid() 
  or 
  (executor_id is null and status = 'OPEN')
);

-- 6. ПОЛИТИКА 4: Заказчики видят и управляют своими заказами
create policy "Customers can manage their own orders"
on "public"."orders"
for all
to authenticated
using (
  customer_id = auth.uid()
);

-- 7. ИСПРАВЛЕНИЕ ДАННЫХ (Опционально, но полезно)
-- Сбрасываем исполнителя у всех открытых заказов, чтобы они точно появились в списке
update "public"."orders"
set executor_id = null
where status = 'OPEN' and executor_id is not null;
