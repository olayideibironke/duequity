create table public.lead_assignment_batches (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  name text not null,
  source_kind text not null default 'upload',
  source_file_name text,
  source_file_sha256 text,
  state_code text not null,
  county_geoid text,
  county_name text not null,
  source_record_count integer,
  status text not null default 'active',
  uploaded_by_staff_user_id uuid not null,
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  row_version bigint not null default 1,

  constraint lead_assignment_batches_reference_check
    check (btrim(reference) <> ''),
  constraint lead_assignment_batches_name_check
    check (btrim(name) <> ''),
  constraint lead_assignment_batches_source_kind_check
    check (source_kind in ('upload','manual')),
  constraint lead_assignment_batches_source_file_check
    check (
      (source_file_name is null or btrim(source_file_name) <> '')
      and (
        source_file_sha256 is null
        or source_file_sha256 ~ '^[0-9a-f]{64}$'
      )
    ),
  constraint lead_assignment_batches_state_code_check
    check (state_code ~ '^[A-Z]{2}$'),
  constraint lead_assignment_batches_county_geoid_check
    check (county_geoid is null or county_geoid ~ '^[0-9]{5}$'),
  constraint lead_assignment_batches_county_name_check
    check (btrim(county_name) <> ''),
  constraint lead_assignment_batches_source_record_count_check
    check (source_record_count is null or source_record_count >= 0),
  constraint lead_assignment_batches_status_check
    check (status in ('active','closed','cancelled')),
  constraint lead_assignment_batches_status_dates_check
    check (
      (status = 'active' and closed_at is null)
      or (status in ('closed','cancelled') and closed_at is not null)
    ),
  constraint lead_assignment_batches_metadata_check
    check (jsonb_typeof(metadata) = 'object'),
  constraint lead_assignment_batches_row_version_check
    check (row_version >= 1),
  constraint lead_assignment_batches_uploaded_by_fkey
    foreign key (uploaded_by_staff_user_id)
    references public.staff_users(id)
    on update restrict on delete restrict
);

create table public.lead_assignments (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid,
  subject_type text not null,
  discovered_record_id text,
  opportunity_id text,
  assigned_to_staff_user_id uuid not null,
  assigned_by_staff_user_id uuid not null,
  assigned_at timestamptz not null,
  status text not null default 'active',
  ended_at timestamptz,
  supersedes_assignment_id uuid,
  note text,
  row_version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint lead_assignments_batch_fkey
    foreign key (batch_id)
    references public.lead_assignment_batches(id)
    on update restrict on delete restrict,
  constraint lead_assignments_discovered_record_fkey
    foreign key (discovered_record_id)
    references public.discovered_records(id)
    on update restrict on delete restrict,
  constraint lead_assignments_opportunity_fkey
    foreign key (opportunity_id)
    references public.opportunities(id)
    on update restrict on delete restrict,
  constraint lead_assignments_assigned_to_fkey
    foreign key (assigned_to_staff_user_id)
    references public.staff_users(id)
    on update restrict on delete restrict,
  constraint lead_assignments_assigned_by_fkey
    foreign key (assigned_by_staff_user_id)
    references public.staff_users(id)
    on update restrict on delete restrict,
  constraint lead_assignments_supersedes_fkey
    foreign key (supersedes_assignment_id)
    references public.lead_assignments(id)
    on update restrict on delete restrict,
  constraint lead_assignments_subject_type_check
    check (subject_type in ('discovered_record','opportunity')),
  constraint lead_assignments_subject_identity_check
    check (
      (
        subject_type = 'discovered_record'
        and discovered_record_id is not null
        and opportunity_id is null
      )
      or
      (
        subject_type = 'opportunity'
        and opportunity_id is not null
        and discovered_record_id is null
      )
    ),
  constraint lead_assignments_status_check
    check (status in ('active','ended')),
  constraint lead_assignments_status_dates_check
    check (
      (status = 'active' and ended_at is null)
      or (status = 'ended' and ended_at is not null)
    ),
  constraint lead_assignments_note_check
    check (note is null or btrim(note) <> ''),
  constraint lead_assignments_row_version_check
    check (row_version >= 1)
);

create unique index lead_assignments_one_active_discovered_idx
  on public.lead_assignments (discovered_record_id)
  where subject_type = 'discovered_record' and status = 'active';

create unique index lead_assignments_one_active_opportunity_idx
  on public.lead_assignments (opportunity_id)
  where subject_type = 'opportunity' and status = 'active';

create index lead_assignments_staff_active_idx
  on public.lead_assignments (assigned_to_staff_user_id, status, assigned_at desc);

create index lead_assignments_batch_idx
  on public.lead_assignments (batch_id, assigned_at desc);

create table public.lead_assignment_events (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null,
  previous_assignment_id uuid,
  batch_id uuid,
  subject_type text not null,
  discovered_record_id text,
  opportunity_id text,
  event_type text not null,
  from_staff_user_id uuid,
  to_staff_user_id uuid,
  actor_staff_user_id uuid not null,
  occurred_at timestamptz not null,
  note text,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),

  constraint lead_assignment_events_assignment_fkey
    foreign key (assignment_id)
    references public.lead_assignments(id)
    on update restrict on delete restrict,
  constraint lead_assignment_events_previous_assignment_fkey
    foreign key (previous_assignment_id)
    references public.lead_assignments(id)
    on update restrict on delete restrict,
  constraint lead_assignment_events_batch_fkey
    foreign key (batch_id)
    references public.lead_assignment_batches(id)
    on update restrict on delete restrict,
  constraint lead_assignment_events_discovered_record_fkey
    foreign key (discovered_record_id)
    references public.discovered_records(id)
    on update restrict on delete restrict,
  constraint lead_assignment_events_opportunity_fkey
    foreign key (opportunity_id)
    references public.opportunities(id)
    on update restrict on delete restrict,
  constraint lead_assignment_events_from_staff_fkey
    foreign key (from_staff_user_id)
    references public.staff_users(id)
    on update restrict on delete restrict,
  constraint lead_assignment_events_to_staff_fkey
    foreign key (to_staff_user_id)
    references public.staff_users(id)
    on update restrict on delete restrict,
  constraint lead_assignment_events_actor_fkey
    foreign key (actor_staff_user_id)
    references public.staff_users(id)
    on update restrict on delete restrict,
  constraint lead_assignment_events_subject_type_check
    check (subject_type in ('discovered_record','opportunity')),
  constraint lead_assignment_events_subject_identity_check
    check (
      (
        subject_type = 'discovered_record'
        and discovered_record_id is not null
        and opportunity_id is null
      )
      or
      (
        subject_type = 'opportunity'
        and opportunity_id is not null
        and discovered_record_id is null
      )
    ),
  constraint lead_assignment_events_event_type_check
    check (event_type in ('assigned','reassigned','unassigned')),
  constraint lead_assignment_events_staff_transition_check
    check (
      (event_type = 'assigned' and from_staff_user_id is null and to_staff_user_id is not null)
      or (event_type = 'reassigned' and from_staff_user_id is not null and to_staff_user_id is not null)
      or (event_type = 'unassigned' and from_staff_user_id is not null and to_staff_user_id is null)
    ),
  constraint lead_assignment_events_note_check
    check (note is null or btrim(note) <> ''),
  constraint lead_assignment_events_detail_check
    check (jsonb_typeof(detail) = 'object')
);

create index lead_assignment_events_assignment_idx
  on public.lead_assignment_events (assignment_id, occurred_at desc);

create index lead_assignment_events_actor_idx
  on public.lead_assignment_events (actor_staff_user_id, occurred_at desc);

alter table public.lead_assignment_batches enable row level security;
alter table public.lead_assignments enable row level security;
alter table public.lead_assignment_events enable row level security;

revoke all on public.lead_assignment_batches from public, anon, authenticated;
revoke all on public.lead_assignments from public, anon, authenticated;
revoke all on public.lead_assignment_events from public, anon, authenticated;

revoke all on public.lead_assignment_batches from service_role;
revoke all on public.lead_assignments from service_role;
revoke all on public.lead_assignment_events from service_role;

grant select on public.lead_assignment_batches to service_role;
grant select on public.lead_assignments to service_role;
grant select on public.lead_assignment_events to service_role;

create or replace function public.guard_lead_assignment_batch_update()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if new.id is distinct from old.id
     or new.reference is distinct from old.reference
     or new.name is distinct from old.name
     or new.source_kind is distinct from old.source_kind
     or new.source_file_name is distinct from old.source_file_name
     or new.source_file_sha256 is distinct from old.source_file_sha256
     or new.state_code is distinct from old.state_code
     or new.county_geoid is distinct from old.county_geoid
     or new.county_name is distinct from old.county_name
     or new.source_record_count is distinct from old.source_record_count
     or new.uploaded_by_staff_user_id is distinct from old.uploaded_by_staff_user_id
     or new.created_at is distinct from old.created_at
     or new.metadata is distinct from old.metadata then
    raise exception 'lead assignment batch provenance is immutable'
      using errcode = '42501';
  end if;

  if old.status <> 'active' then
    raise exception 'closed or cancelled lead assignment batch is terminal'
      using errcode = '42501';
  end if;

  if new.status not in ('closed','cancelled') or new.closed_at is null then
    raise exception 'active lead assignment batch may only transition to closed or cancelled'
      using errcode = '42501';
  end if;

  new.row_version := old.row_version + 1;
  return new;
end;
$$;

create trigger lead_assignment_batches_update_guard
before update on public.lead_assignment_batches
for each row execute function public.guard_lead_assignment_batch_update();

create or replace function public.reject_lead_assignment_batch_delete()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  raise exception 'lead assignment batches cannot be deleted'
    using errcode = '42501';
end;
$$;

create trigger lead_assignment_batches_delete_guard
before delete on public.lead_assignment_batches
for each row execute function public.reject_lead_assignment_batch_delete();

create or replace function public.guard_lead_assignment_update()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if new.id is distinct from old.id
     or new.batch_id is distinct from old.batch_id
     or new.subject_type is distinct from old.subject_type
     or new.discovered_record_id is distinct from old.discovered_record_id
     or new.opportunity_id is distinct from old.opportunity_id
     or new.assigned_to_staff_user_id is distinct from old.assigned_to_staff_user_id
     or new.assigned_by_staff_user_id is distinct from old.assigned_by_staff_user_id
     or new.assigned_at is distinct from old.assigned_at
     or new.supersedes_assignment_id is distinct from old.supersedes_assignment_id
     or new.note is distinct from old.note
     or new.created_at is distinct from old.created_at then
    raise exception 'lead assignment provenance is immutable'
      using errcode = '42501';
  end if;

  if old.status <> 'active'
     or new.status <> 'ended'
     or old.ended_at is not null
     or new.ended_at is null then
    raise exception 'lead assignment may only transition once from active to ended'
      using errcode = '42501';
  end if;

  new.row_version := old.row_version + 1;
  new.updated_at := pg_catalog.clock_timestamp();
  return new;
end;
$$;

create trigger lead_assignments_update_guard
before update on public.lead_assignments
for each row execute function public.guard_lead_assignment_update();

create or replace function public.reject_lead_assignment_delete()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  raise exception 'lead assignments cannot be deleted'
    using errcode = '42501';
end;
$$;

create trigger lead_assignments_delete_guard
before delete on public.lead_assignments
for each row execute function public.reject_lead_assignment_delete();

create or replace function public.reject_lead_assignment_event_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  raise exception 'lead assignment event history is append-only'
    using errcode = '42501';
end;
$$;

create trigger lead_assignment_events_update_guard
before update on public.lead_assignment_events
for each row execute function public.reject_lead_assignment_event_mutation();

create trigger lead_assignment_events_delete_guard
before delete on public.lead_assignment_events
for each row execute function public.reject_lead_assignment_event_mutation();

create or replace function public.create_lead_assignment_batch(
  p_reference text,
  p_name text,
  p_source_kind text,
  p_source_file_name text,
  p_source_file_sha256 text,
  p_state_code text,
  p_county_geoid text,
  p_county_name text,
  p_source_record_count integer,
  p_actor_staff_user_id uuid,
  p_metadata jsonb default '{}'::jsonb
)
returns setof public.lead_assignment_batches
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor public.staff_users%rowtype;
  v_batch public.lead_assignment_batches%rowtype;
begin
  select * into v_actor
  from public.staff_users
  where id = p_actor_staff_user_id;

  if not found
     or v_actor.status <> 'active'
     or v_actor.role not in ('super_admin','administrator') then
    raise exception 'only an active DueQuity administrator may create a lead assignment batch'
      using errcode = '42501';
  end if;

  insert into public.lead_assignment_batches (
    reference,
    name,
    source_kind,
    source_file_name,
    source_file_sha256,
    state_code,
    county_geoid,
    county_name,
    source_record_count,
    uploaded_by_staff_user_id,
    metadata
  ) values (
    btrim(p_reference),
    btrim(p_name),
    p_source_kind,
    nullif(btrim(coalesce(p_source_file_name,'')),''),
    nullif(lower(btrim(coalesce(p_source_file_sha256,''))),''),
    upper(btrim(p_state_code)),
    nullif(btrim(coalesce(p_county_geoid,'')),''),
    btrim(p_county_name),
    p_source_record_count,
    p_actor_staff_user_id,
    coalesce(p_metadata,'{}'::jsonb)
  )
  returning * into v_batch;

  return next v_batch;
  return;
end;
$$;

create or replace function public.assign_lead_to_staff(
  p_subject_type text,
  p_record_id text,
  p_staff_user_id uuid,
  p_actor_staff_user_id uuid,
  p_batch_id uuid default null,
  p_occurred_at timestamptz default null,
  p_note text default null
)
returns setof public.lead_assignments
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor public.staff_users%rowtype;
  v_target public.staff_users%rowtype;
  v_batch public.lead_assignment_batches%rowtype;
  v_current public.lead_assignments%rowtype;
  v_new public.lead_assignments%rowtype;
  v_discovered public.discovered_records%rowtype;
  v_opportunity public.opportunities%rowtype;
  v_property public.properties%rowtype;
  v_event_type text;
  v_occurred_at timestamptz := coalesce(p_occurred_at, pg_catalog.clock_timestamp());
  v_record_id text := btrim(coalesce(p_record_id,''));
begin
  if p_subject_type not in ('discovered_record','opportunity') or v_record_id = '' then
    raise exception 'valid lead subject type and record id are required'
      using errcode = '22023';
  end if;

  select * into v_actor
  from public.staff_users
  where id = p_actor_staff_user_id;

  if not found
     or v_actor.status <> 'active'
     or v_actor.role not in ('super_admin','administrator') then
    raise exception 'only an active DueQuity administrator may assign leads'
      using errcode = '42501';
  end if;

  select * into v_target
  from public.staff_users
  where id = p_staff_user_id;

  if not found or v_target.status <> 'active' then
    raise exception 'lead target must be an active DueQuity staff user'
      using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext(p_subject_type || ':' || v_record_id)
  );

  if p_batch_id is not null then
    select * into v_batch
    from public.lead_assignment_batches
    where id = p_batch_id;

    if not found or v_batch.status <> 'active' then
      raise exception 'lead assignment batch is not active'
        using errcode = '42501';
    end if;
  end if;

  if p_subject_type = 'discovered_record' then
    select * into v_discovered
    from public.discovered_records
    where id = v_record_id;

    if not found then
      raise exception 'discovered lead record not found'
        using errcode = 'P0002';
    end if;

    if p_batch_id is not null then
      if v_batch.state_code <> v_discovered.state_code
         or lower(btrim(v_batch.county_name)) <> lower(btrim(v_discovered.county)) then
        raise exception 'lead record does not match the assignment batch county/state'
          using errcode = '42501';
      end if;
    end if;

    select * into v_current
    from public.lead_assignments
    where subject_type = 'discovered_record'
      and discovered_record_id = v_record_id
      and status = 'active'
    for update;
  else
    select * into v_opportunity
    from public.opportunities
    where id = v_record_id;

    if not found then
      raise exception 'opportunity lead record not found'
        using errcode = 'P0002';
    end if;

    if p_batch_id is not null then
      select * into v_property
      from public.properties
      where id = v_opportunity.property_id;

      if not found
         or v_batch.state_code <> v_property.state_code
         or lower(btrim(v_batch.county_name)) <> lower(btrim(v_property.county)) then
        raise exception 'opportunity does not match the assignment batch county/state'
          using errcode = '42501';
      end if;
    end if;

    select * into v_current
    from public.lead_assignments
    where subject_type = 'opportunity'
      and opportunity_id = v_record_id
      and status = 'active'
    for update;
  end if;

  if found and v_current.assigned_to_staff_user_id = p_staff_user_id then
    return next v_current;
    return;
  end if;

  if found then
    update public.lead_assignments
       set status = 'ended',
           ended_at = v_occurred_at
     where id = v_current.id;
    v_event_type := 'reassigned';
  else
    v_event_type := 'assigned';
  end if;

  insert into public.lead_assignments (
    batch_id,
    subject_type,
    discovered_record_id,
    opportunity_id,
    assigned_to_staff_user_id,
    assigned_by_staff_user_id,
    assigned_at,
    supersedes_assignment_id,
    note
  ) values (
    p_batch_id,
    p_subject_type,
    case when p_subject_type = 'discovered_record' then v_record_id else null end,
    case when p_subject_type = 'opportunity' then v_record_id else null end,
    p_staff_user_id,
    p_actor_staff_user_id,
    v_occurred_at,
    case when v_event_type = 'reassigned' then v_current.id else null end,
    nullif(btrim(coalesce(p_note,'')),'')
  )
  returning * into v_new;

  insert into public.lead_assignment_events (
    assignment_id,
    previous_assignment_id,
    batch_id,
    subject_type,
    discovered_record_id,
    opportunity_id,
    event_type,
    from_staff_user_id,
    to_staff_user_id,
    actor_staff_user_id,
    occurred_at,
    note,
    detail
  ) values (
    v_new.id,
    case when v_event_type = 'reassigned' then v_current.id else null end,
    p_batch_id,
    p_subject_type,
    case when p_subject_type = 'discovered_record' then v_record_id else null end,
    case when p_subject_type = 'opportunity' then v_record_id else null end,
    v_event_type,
    case when v_event_type = 'reassigned' then v_current.assigned_to_staff_user_id else null end,
    p_staff_user_id,
    p_actor_staff_user_id,
    v_occurred_at,
    nullif(btrim(coalesce(p_note,'')),''),
    pg_catalog.jsonb_build_object(
      'batchId', p_batch_id,
      'subjectType', p_subject_type,
      'recordId', v_record_id
    )
  );

  return next v_new;
  return;
end;
$$;

create or replace function public.unassign_lead_from_staff(
  p_subject_type text,
  p_record_id text,
  p_actor_staff_user_id uuid,
  p_occurred_at timestamptz default null,
  p_note text default null
)
returns setof public.lead_assignments
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor public.staff_users%rowtype;
  v_current public.lead_assignments%rowtype;
  v_occurred_at timestamptz := coalesce(p_occurred_at, pg_catalog.clock_timestamp());
  v_record_id text := btrim(coalesce(p_record_id,''));
begin
  if p_subject_type not in ('discovered_record','opportunity') or v_record_id = '' then
    raise exception 'valid lead subject type and record id are required'
      using errcode = '22023';
  end if;

  select * into v_actor
  from public.staff_users
  where id = p_actor_staff_user_id;

  if not found
     or v_actor.status <> 'active'
     or v_actor.role not in ('super_admin','administrator') then
    raise exception 'only an active DueQuity administrator may unassign leads'
      using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext(p_subject_type || ':' || v_record_id)
  );

  if p_subject_type = 'discovered_record' then
    select * into v_current
    from public.lead_assignments
    where subject_type = 'discovered_record'
      and discovered_record_id = v_record_id
      and status = 'active'
    for update;
  else
    select * into v_current
    from public.lead_assignments
    where subject_type = 'opportunity'
      and opportunity_id = v_record_id
      and status = 'active'
    for update;
  end if;

  if not found then
    raise exception 'active lead assignment not found'
      using errcode = 'P0002';
  end if;

  update public.lead_assignments
     set status = 'ended',
         ended_at = v_occurred_at
   where id = v_current.id
   returning * into v_current;

  insert into public.lead_assignment_events (
    assignment_id,
    previous_assignment_id,
    batch_id,
    subject_type,
    discovered_record_id,
    opportunity_id,
    event_type,
    from_staff_user_id,
    to_staff_user_id,
    actor_staff_user_id,
    occurred_at,
    note,
    detail
  ) values (
    v_current.id,
    null,
    v_current.batch_id,
    v_current.subject_type,
    v_current.discovered_record_id,
    v_current.opportunity_id,
    'unassigned',
    v_current.assigned_to_staff_user_id,
    null,
    p_actor_staff_user_id,
    v_occurred_at,
    nullif(btrim(coalesce(p_note,'')),''),
    pg_catalog.jsonb_build_object(
      'batchId', v_current.batch_id,
      'subjectType', v_current.subject_type,
      'recordId', v_record_id
    )
  );

  return next v_current;
  return;
end;
$$;

create or replace function public.close_lead_assignment_batch(
  p_batch_id uuid,
  p_actor_staff_user_id uuid,
  p_status text,
  p_closed_at timestamptz default null
)
returns setof public.lead_assignment_batches
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor public.staff_users%rowtype;
  v_batch public.lead_assignment_batches%rowtype;
begin
  if p_status not in ('closed','cancelled') then
    raise exception 'batch close status must be closed or cancelled'
      using errcode = '22023';
  end if;

  select * into v_actor
  from public.staff_users
  where id = p_actor_staff_user_id;

  if not found
     or v_actor.status <> 'active'
     or v_actor.role not in ('super_admin','administrator') then
    raise exception 'only an active DueQuity administrator may close a lead assignment batch'
      using errcode = '42501';
  end if;

  update public.lead_assignment_batches
     set status = p_status,
         closed_at = coalesce(p_closed_at, pg_catalog.clock_timestamp())
   where id = p_batch_id
     and status = 'active'
   returning * into v_batch;

  if not found then
    raise exception 'active lead assignment batch not found'
      using errcode = 'P0002';
  end if;

  return next v_batch;
  return;
end;
$$;

revoke all on function public.create_lead_assignment_batch(text,text,text,text,text,text,text,text,integer,uuid,jsonb) from public, anon, authenticated;
revoke all on function public.assign_lead_to_staff(text,text,uuid,uuid,uuid,timestamptz,text) from public, anon, authenticated;
revoke all on function public.unassign_lead_from_staff(text,text,uuid,timestamptz,text) from public, anon, authenticated;
revoke all on function public.close_lead_assignment_batch(uuid,uuid,text,timestamptz) from public, anon, authenticated;

grant execute on function public.create_lead_assignment_batch(text,text,text,text,text,text,text,text,integer,uuid,jsonb) to service_role;
grant execute on function public.assign_lead_to_staff(text,text,uuid,uuid,uuid,timestamptz,text) to service_role;
grant execute on function public.unassign_lead_from_staff(text,text,uuid,timestamptz,text) to service_role;
grant execute on function public.close_lead_assignment_batch(uuid,uuid,text,timestamptz) to service_role;;
