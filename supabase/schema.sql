
create extension if not exists pgcrypto;

create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null,
  price numeric(10, 2) not null default 0 check (price >= 0),
  description text not null default '',
  tag text,
  image_url text,
  image_path text,
  available boolean not null default true,
  sort_order integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.admins enable row level security;
alter table public.products enable row level security;

grant select on public.admins to authenticated;
grant select on public.products to anon, authenticated;
grant insert, update, delete on public.products to authenticated;

drop policy if exists "Admins can read own admin record" on public.admins;
create policy "Admins can read own admin record"
on public.admins for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "Public read products" on public.products;
create policy "Public read products"
on public.products for select to anon, authenticated
using (true);

drop policy if exists "Admins insert products" on public.products;
create policy "Admins insert products"
on public.products for insert to authenticated
with check (
  exists (
    select 1 from public.admins a
    where a.user_id = (select auth.uid())
  )
);

drop policy if exists "Admins update products" on public.products;
create policy "Admins update products"
on public.products for update to authenticated
using (
  exists (
    select 1 from public.admins a
    where a.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.admins a
    where a.user_id = (select auth.uid())
  )
);

drop policy if exists "Admins delete products" on public.products;
create policy "Admins delete products"
on public.products for delete to authenticated
using (
  exists (
    select 1 from public.admins a
    where a.user_id = (select auth.uid())
  )
);

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'menu-photos',
  'menu-photos',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public view menu photos" on storage.objects;
create policy "Public view menu photos"
on storage.objects for select to anon, authenticated
using (bucket_id = 'menu-photos');

drop policy if exists "Admins upload own menu photos" on storage.objects;
create policy "Admins upload own menu photos"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'menu-photos'
  and exists (
    select 1 from public.admins a
    where a.user_id = (select auth.uid())
  )
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Admins update own menu photos" on storage.objects;
create policy "Admins update own menu photos"
on storage.objects for update to authenticated
using (
  bucket_id = 'menu-photos'
  and exists (
    select 1 from public.admins a
    where a.user_id = (select auth.uid())
  )
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'menu-photos'
  and exists (
    select 1 from public.admins a
    where a.user_id = (select auth.uid())
  )
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Admins delete own menu photos" on storage.objects;
create policy "Admins delete own menu photos"
on storage.objects for delete to authenticated
using (
  bucket_id = 'menu-photos'
  and exists (
    select 1 from public.admins a
    where a.user_id = (select auth.uid())
  )
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

