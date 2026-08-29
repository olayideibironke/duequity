create table if not exists public.lead_assignment_batch_rows (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.lead_assignment_batches(id) on update restrict on delete restrict,
  row_number integer not null check (row_number >= 1),
  discovered_record_id text not null references public.discovered_records(id) on update restrict on delete restrict,
  source_row_snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(source_row_snapshot) = 'object'),
  created_at timestamptz not null default now(),
  unique (batch_id, row_number),
  unique (batch_id, discovered_record_id)
);

alter table public.lead_assignment_batch_rows enable row level security;

revoke all on public.lead_assignment_batch_rows from public, anon, authenticated;

drop function if exists public.create_lead_upload_batch(text,text,text,text,text,text,text,uuid,jsonb,jsonb);

create or replace function public.create_lead_upload_batch(
  p_reference text,
  p_name text,
  p_source_file_name text,
  p_source_file_sha256 text,
  p_state_code text,
  p_county_geoid text,
  p_county_name text,
  p_actor_staff_user_id uuid,
  p_metadata jsonb,
  p_rows jsonb
)
returns setof public.lead_assignment_batches
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_actor public.staff_users%rowtype;
  v_batch public.lead_assignment_batches%rowtype;
  v_row jsonb;
  v_record public.discovered_records%rowtype;
  v_row_number integer;
  v_record_id text;
  v_snapshot jsonb;
  v_state text := upper(btrim(coalesce(p_state_code,'')));
  v_county text := btrim(coalesce(p_county_name,''));
begin
  select * into v_actor
  from public.staff_users
  where id = p_actor_staff_user_id;

  if not found
     or v_actor.status <> 'active'
     or v_actor.role not in ('super_admin','administrator') then
    raise exception 'only an active DueQuity administrator may upload lead batches'
      using errcode = '42501';
  end if;

  if v_state !~ '^[A-Z]{2}$' or v_county = '' then
    raise exception 'valid state and county are required'
      using errcode = '22023';
  end if;

  if p_rows is null
     or jsonb_typeof(p_rows) <> 'array'
     or jsonb_array_length(p_rows) = 0 then
    raise exception 'lead upload must contain at least one assignable row'
      using errcode = '22023';
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
    'upload',
    nullif(btrim(coalesce(p_source_file_name,'')),''),
    nullif(lower(btrim(coalesce(p_source_file_sha256,''))),''),
    v_state,
    nullif(btrim(coalesce(p_county_geoid,'')),''),
    v_county,
    jsonb_array_length(p_rows),
    p_actor_staff_user_id,
    coalesce(p_metadata,'{}'::jsonb)
  )
  returning * into v_batch;

  for v_row in
    select value
    from jsonb_array_elements(p_rows)
  loop
    v_row_number := nullif(v_row->>'rowNumber','')::integer;
    v_record_id := btrim(coalesce(v_row->>'discoveredRecordId',''));
    v_snapshot := coalesce(v_row->'sourceRowSnapshot','{}'::jsonb);

    if v_row_number is null or v_row_number < 1 or v_record_id = '' then
      raise exception 'each upload row requires rowNumber and discoveredRecordId'
        using errcode = '22023';
    end if;

    if jsonb_typeof(v_snapshot) <> 'object' then
      raise exception 'sourceRowSnapshot must be a JSON object'
        using errcode = '22023';
    end if;

    select * into v_record
    from public.discovered_records
    where id = v_record_id;

    if not found then
      raise exception 'DueQuity record % does not exist', v_record_id
        using errcode = 'P0002';
    end if;

    if v_record.status not in ('new','reviewed')
       or v_record.promoted_opportunity_id is not null then
      raise exception 'DueQuity record % is no longer assignable at Discovery stage', v_record_id
        using errcode = '42501';
    end if;

    if v_record.state_code <> v_state
       or lower(btrim(v_record.county)) <> lower(v_county) then
      raise exception 'DueQuity record % does not match upload county/state', v_record_id
        using errcode = '42501';
    end if;

    insert into public.lead_assignment_batch_rows (
      batch_id,
      row_number,
      discovered_record_id,
      source_row_snapshot
    ) values (
      v_batch.id,
      v_row_number,
      v_record_id,
      v_snapshot
    );
  end loop;

  return next v_batch;
  return;
end;
$function$;

revoke all on function public.create_lead_upload_batch(text,text,text,text,text,text,text,uuid,jsonb,jsonb) from public, anon, authenticated;

drop function if exists public.assign_lead_batch_to_staff(uuid,uuid,uuid,text);

create or replace function public.assign_lead_batch_to_staff(
  p_batch_id uuid,
  p_staff_user_id uuid,
  p_actor_staff_user_id uuid,
  p_note text default null
)
returns setof public.lead_assignments
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_actor public.staff_users%rowtype;
  v_target public.staff_users%rowtype;
  v_batch public.lead_assignment_batches%rowtype;
  v_row public.lead_assignment_batch_rows%rowtype;
begin
  select * into v_actor
  from public.staff_users
  where id = p_actor_staff_user_id;

  if not found
     or v_actor.status <> 'active'
     or v_actor.role not in ('super_admin','administrator') then
    raise exception 'only an active DueQuity administrator may assign lead batches'
      using errcode = '42501';
  end if;

  select * into v_target
  from public.staff_users
  where id = p_staff_user_id;

  if not found or v_target.status <> 'active' then
    raise exception 'lead target must be an active DueQuity staff user'
      using errcode = '42501';
  end if;

  select * into v_batch
  from public.lead_assignment_batches
  where id = p_batch_id;

  if not found or v_batch.status <> 'active' then
    raise exception 'lead assignment batch is not active'
      using errcode = '42501';
  end if;

  if coalesce(array_length(v_target.states_cleared,1),0) > 0
     and not (v_batch.state_code = any(v_target.states_cleared)) then
    raise exception 'staff member is not cleared for batch state %', v_batch.state_code
      using errcode = '42501';
  end if;

  for v_row in
    select *
    from public.lead_assignment_batch_rows
    where batch_id = p_batch_id
    order by row_number
  loop
    return query
    select *
    from public.assign_lead_to_staff(
      'discovered_record',
      v_row.discovered_record_id,
      p_staff_user_id,
      p_actor_staff_user_id,
      p_batch_id,
      null,
      nullif(btrim(coalesce(p_note,'')),'')
    );
  end loop;

  return;
end;
$function$;

revoke all on function public.assign_lead_batch_to_staff(uuid,uuid,uuid,text) from public, anon, authenticated;;
