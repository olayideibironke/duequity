create unique index if not exists lead_assignment_batches_unique_live_file_sha256_idx
on public.lead_assignment_batches (source_file_sha256)
where source_file_sha256 is not null and status <> 'cancelled';

create or replace function public.assign_lead_batch_to_staff(
  p_batch_id uuid,
  p_staff_user_id uuid,
  p_actor_staff_user_id uuid,
  p_note text default null::text
)
returns setof public.lead_assignments
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
declare
  v_actor public.staff_users%rowtype;
  v_target public.staff_users%rowtype;
  v_batch public.lead_assignment_batches%rowtype;
  v_row public.lead_assignment_batch_rows%rowtype;
  v_conflict_count integer;
  v_conflict_record_id text;
  v_conflict_staff_name text;
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

  if v_target.role = 'super_admin' then
    raise exception 'the Super Admin account is not an ordinary lead assignment target'
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

  select count(*)::integer
    into v_conflict_count
  from public.lead_assignment_batch_rows br
  join public.lead_assignments la
    on la.subject_type = 'discovered_record'
   and la.discovered_record_id = br.discovered_record_id
   and la.status = 'active'
  where br.batch_id = p_batch_id;

  if v_conflict_count > 0 then
    select br.discovered_record_id, su.name
      into v_conflict_record_id, v_conflict_staff_name
    from public.lead_assignment_batch_rows br
    join public.lead_assignments la
      on la.subject_type = 'discovered_record'
     and la.discovered_record_id = br.discovered_record_id
     and la.status = 'active'
    join public.staff_users su
      on su.id = la.assigned_to_staff_user_id
    where br.batch_id = p_batch_id
    order by la.assigned_at asc
    limit 1;

    raise exception 'batch assignment blocked: % lead(s) are already actively assigned. First conflict: % assigned to %',
      v_conflict_count,
      coalesce(v_conflict_record_id, 'unknown'),
      coalesce(v_conflict_staff_name, 'another staff member')
      using errcode = '23505';
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