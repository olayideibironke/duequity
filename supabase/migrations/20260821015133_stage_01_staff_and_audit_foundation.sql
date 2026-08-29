create table public.staff_users (
  id uuid primary key references auth.users(id) on update cascade on delete restrict,
  name text not null check (btrim(name) <> ''),
  email text not null check (btrim(email) <> ''),
  role text not null check (btrim(role) <> '' and lower(btrim(role)) <> 'claimant'),
  title text not null check (btrim(title) <> ''),
  states_cleared text[] not null default '{}'::text[] check (
    states_cleared <@ array[
      'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC'
    ]::text[]
  ),
  mfa_enrolled boolean not null default false,
  last_active_at date,
  status text not null check (status in ('active','suspended','invited')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.staff_users is
  'DueQuity staff profile and persisted authorization-state foundation. ROLE_PERMISSIONS remains application policy in code. Empty states_cleared means national clearance.';

create unique index staff_users_email_ci_uidx
  on public.staff_users (lower(btrim(email)));
create index staff_users_role_status_idx
  on public.staff_users (role, status);

create or replace function public.set_staff_users_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

create trigger staff_users_set_updated_at
before update on public.staff_users
for each row
execute function public.set_staff_users_updated_at();

create table public.audit_events (
  id uuid primary key default extensions.gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  actor_id text not null check (btrim(actor_id) <> ''),
  actor_name text not null check (btrim(actor_name) <> ''),
  actor_role text not null check (btrim(actor_role) <> ''),
  action text not null check (btrim(action) <> ''),
  target_type text not null check (btrim(target_type) <> ''),
  target_id text not null check (btrim(target_id) <> ''),
  target_label text,
  outcome text not null check (btrim(outcome) <> ''),
  ip_prefix text,
  device_summary text,
  detail text,
  chain_position bigint not null unique,
  previous_event_hash bytea,
  event_hash bytea not null,
  constraint audit_events_chain_shape_chk check (
    (chain_position = 1 and previous_event_hash is null)
    or
    (chain_position > 1 and previous_event_hash is not null)
  )
);

comment on table public.audit_events is
  'Unified immutable DueQuity audit sink. Hash chaining provides tamper-evident integrity protection, not absolute protection against a privileged PostgreSQL superuser who deliberately reconstructs the chain.';
comment on column public.audit_events.chain_position is
  'Monotonic position assigned under a transaction-level advisory lock.';
comment on column public.audit_events.previous_event_hash is
  'SHA-256 hash of the preceding audit event; NULL only for chain position 1.';
comment on column public.audit_events.event_hash is
  'SHA-256 over deterministic immutable event payload plus previous_event_hash.';

create index audit_events_occurred_at_idx
  on public.audit_events (occurred_at);
create index audit_events_actor_occurred_at_idx
  on public.audit_events (actor_id, occurred_at);
create index audit_events_target_occurred_at_idx
  on public.audit_events (target_type, target_id, occurred_at);
create index audit_events_action_occurred_at_idx
  on public.audit_events (action, occurred_at);

create or replace function public.prepare_audit_event_chain()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_last_position bigint;
  v_last_hash bytea;
  v_payload text;
begin
  perform pg_catalog.pg_advisory_xact_lock(731921, 1);

  select ae.chain_position, ae.event_hash
    into v_last_position, v_last_hash
  from public.audit_events as ae
  order by ae.chain_position desc
  limit 1;

  new.chain_position := coalesce(v_last_position, 0) + 1;
  new.previous_event_hash := v_last_hash;

  v_payload := pg_catalog.jsonb_build_array(
    'duequity.audit_events.v1',
    new.id::text,
    pg_catalog.to_char(new.occurred_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    new.actor_id,
    new.actor_name,
    new.actor_role,
    new.action,
    new.target_type,
    new.target_id,
    new.target_label,
    new.outcome,
    new.ip_prefix,
    new.device_summary,
    new.detail,
    case when new.previous_event_hash is null then null else pg_catalog.encode(new.previous_event_hash, 'hex') end
  )::text;

  new.event_hash := extensions.digest(pg_catalog.convert_to(v_payload, 'UTF8'), 'sha256');
  return new;
end;
$$;

create or replace function public.reject_audit_event_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  raise exception 'audit_events is append-only: % is not permitted', tg_op
    using errcode = '42501';
end;
$$;

create trigger audit_events_prepare_chain
before insert on public.audit_events
for each row
execute function public.prepare_audit_event_chain();

create trigger audit_events_reject_mutation
before update or delete on public.audit_events
for each row
execute function public.reject_audit_event_mutation();

alter table public.staff_users enable row level security;
alter table public.audit_events enable row level security;

revoke all privileges on table public.staff_users from public, anon, authenticated;
revoke all privileges on table public.audit_events from public, anon, authenticated;

revoke all privileges on table public.audit_events from service_role;
grant select, insert on table public.audit_events to service_role;

revoke all privileges on table public.staff_users from service_role;
grant select, insert, update on table public.staff_users to service_role;

revoke update, delete, truncate on table public.audit_events from service_role;
revoke delete, truncate on table public.staff_users from service_role;
;
