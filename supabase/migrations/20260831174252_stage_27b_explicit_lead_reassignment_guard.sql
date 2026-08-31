create or replace function public.reassign_discovered_lead_explicit(
  p_record_id text,
  p_expected_assignment_id uuid,
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
  v_record_id text := btrim(coalesce(p_record_id,''));
  v_actor public.staff_users%rowtype;
  v_target public.staff_users%rowtype;
  v_current public.lead_assignments%rowtype;
begin
  if v_record_id = '' or p_expected_assignment_id is null or p_staff_user_id is null or p_actor_staff_user_id is null then
    raise exception 'record, current assignment, replacement staff and administrator are required'
      using errcode = '22023';
  end if;

  select * into v_actor
  from public.staff_users
  where id = p_actor_staff_user_id;

  if not found
     or v_actor.status <> 'active'
     or v_actor.role not in ('super_admin','administrator') then
    raise exception 'only an active DueQuity administrator may reassign leads'
      using errcode = '42501';
  end if;

  select * into v_target
  from public.staff_users
  where id = p_staff_user_id;

  if not found or v_target.status <> 'active' then
    raise exception 'replacement lead target must be an active DueQuity staff user'
      using errcode = '42501';
  end if;

  if v_target.role = 'super_admin' then
    raise exception 'the Super Admin account is not an ordinary lead assignment target'
      using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('discovered_record:' || v_record_id)
  );

  select * into v_current
  from public.lead_assignments
  where subject_type = 'discovered_record'
    and discovered_record_id = v_record_id
    and status = 'active'
  for update;

  if not found then
    raise exception 'active lead assignment no longer exists; refresh before reassigning'
      using errcode = '40001';
  end if;

  if v_current.id <> p_expected_assignment_id then
    raise exception 'lead assignment changed after the page was loaded; refresh before reassigning'
      using errcode = '40001';
  end if;

  if v_current.assigned_to_staff_user_id = p_staff_user_id then
    raise exception 'replacement staff member is already the active owner of this lead'
      using errcode = '22023';
  end if;

  return query
  select *
  from public.assign_lead_to_staff(
    'discovered_record',
    v_record_id,
    p_staff_user_id,
    p_actor_staff_user_id,
    v_current.batch_id,
    null,
    nullif(btrim(coalesce(p_note,'')),'')
  );

  return;
end;
$function$;

revoke all on function public.reassign_discovered_lead_explicit(text, uuid, uuid, uuid, text) from public;
revoke all on function public.reassign_discovered_lead_explicit(text, uuid, uuid, uuid, text) from anon;
revoke all on function public.reassign_discovered_lead_explicit(text, uuid, uuid, uuid, text) from authenticated;