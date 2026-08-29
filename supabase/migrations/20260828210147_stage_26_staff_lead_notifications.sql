create table public.lead_assignment_receipts (
  assignment_id uuid primary key
    references public.lead_assignments(id)
    on update restrict
    on delete restrict,

  first_seen_at timestamptz not null,

  created_at timestamptz not null
    default now()
);

create index lead_assignment_receipts_first_seen_idx
  on public.lead_assignment_receipts(first_seen_at);

alter table public.lead_assignment_receipts
  enable row level security;

revoke all
  on table public.lead_assignment_receipts
  from public, anon, authenticated;

grant all
  on table public.lead_assignment_receipts
  to service_role;

create or replace function public.count_unseen_staff_lead_assignments(
  p_staff_user_id uuid
)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_count bigint;
begin
  if p_staff_user_id is null then
    raise exception 'staff user id is required'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.staff_users
    where id = p_staff_user_id
      and status = 'active'
  ) then
    raise exception 'active staff user not found'
      using errcode = 'P0002';
  end if;

  select count(*)
    into v_count
  from public.lead_assignments assignment
  left join public.lead_assignment_receipts receipt
    on receipt.assignment_id = assignment.id
  where assignment.assigned_to_staff_user_id = p_staff_user_id
    and assignment.status = 'active'
    and receipt.assignment_id is null;

  return v_count;
end;
$$;

create or replace function public.mark_staff_lead_assignments_seen(
  p_staff_user_id uuid,
  p_seen_at timestamptz
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_inserted integer;
begin
  if p_staff_user_id is null
     or p_seen_at is null then
    raise exception 'staff user id and seen timestamp are required'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.staff_users
    where id = p_staff_user_id
      and status = 'active'
  ) then
    raise exception 'active staff user not found'
      using errcode = 'P0002';
  end if;

  insert into public.lead_assignment_receipts (
    assignment_id,
    first_seen_at
  )
  select
    assignment.id,
    p_seen_at
  from public.lead_assignments assignment
  where assignment.assigned_to_staff_user_id = p_staff_user_id
    and assignment.status = 'active'
  on conflict (assignment_id)
  do nothing;

  get diagnostics v_inserted = row_count;

  return v_inserted;
end;
$$;

revoke all
  on function public.count_unseen_staff_lead_assignments(uuid)
  from public, anon, authenticated;

revoke all
  on function public.mark_staff_lead_assignments_seen(
    uuid,
    timestamptz
  )
  from public, anon, authenticated;

grant execute
  on function public.count_unseen_staff_lead_assignments(uuid)
  to service_role;

grant execute
  on function public.mark_staff_lead_assignments_seen(
    uuid,
    timestamptz
  )
  to service_role;;
