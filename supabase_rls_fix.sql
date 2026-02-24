-- Enable RLS on profiles if not already enabled
alter table profiles enable row level security;

-- Policy to allow users to update their own profile
create policy "Users can update own profile"
  on profiles for update
  using ( auth.uid() = id );

-- Policy to allow Customers to update Executor profiles (for subscription management)
create policy "Customers can update executor profiles"
  on profiles for update
  using (
    auth.uid() in (
      select id from profiles where role = 'CUSTOMER'
    )
    and
    role = 'EXECUTOR'
  );

-- Policy to allow Executors to update Customer profiles (for subscription management)
create policy "Executors can update customer profiles"
  on profiles for update
  using (
    auth.uid() in (
      select id from profiles where role = 'EXECUTOR'
    )
    and
    role = 'CUSTOMER'
  );
