create or replace function public.close_claim_final(
  p_claim_id text,
  p_closure_id text,
  p_retention_id text,
  p_actor_user_id text,
  p_closed_at timestamptz,
  p_summary text
)
returns setof public.claim_closures
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_review public.claim_authority_reviews%rowtype;
  v_settlement public.claim_recovery_settlements%rowtype;
  v_closure public.claim_closures%rowtype;
  v_outcome text;
begin
  if p_claim_id is null or btrim(p_claim_id) = ''
     or p_closure_id is null or btrim(p_closure_id) = ''
     or p_retention_id is null or btrim(p_retention_id) = ''
     or p_actor_user_id is null or btrim(p_actor_user_id) = ''
     or p_closed_at is null
     or p_summary is null or btrim(p_summary) = '' then
    raise exception 'claim id, closure id, retention id, actor, closure timestamp, and summary are required'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.claim_closures
    where claim_id = p_claim_id
  ) then
    raise exception 'claim is already finally closed'
      using errcode = '42501';
  end if;

  select * into v_review
  from public.claim_authority_reviews
  where claim_id = p_claim_id
  for update;

  if not found then
    raise exception 'authority review not found for final claim closure'
      using errcode = 'P0002';
  end if;

  if v_review.status <> 'closed' or v_review.closed_at is null then
    raise exception 'final claim closure requires the authority-review lifecycle to be closed first'
      using errcode = '42501';
  end if;

  if p_closed_at < v_review.closed_at then
    raise exception 'final claim closure cannot precede authority-review closure'
      using errcode = '22023';
  end if;

  select * into v_settlement
  from public.claim_recovery_settlements
  where claim_id = p_claim_id
  for update;

  if found then
    if v_settlement.status <> 'reconciled' or v_settlement.reconciled_at is null then
      raise exception 'recovered claim cannot close finally before recovery reconciliation'
        using errcode = '42501';
    end if;

    if p_closed_at < v_settlement.reconciled_at then
      raise exception 'final claim closure cannot precede recovery reconciliation'
        using errcode = '22023';
    end if;

    v_outcome := 'recovered_reconciled';

  elsif v_review.denial_reason is not null then
    v_outcome := 'denied_final';

  else
    v_outcome := 'closed_without_recovery';
  end if;

  insert into public.claim_closures (
    id,
    claim_id,
    claim_reference,
    authority_review_id,
    recovery_settlement_id,
    final_outcome,
    authority_closed_at,
    recovery_reconciled_at,
    closed_at,
    closed_by_user_id,
    closure_summary
  ) values (
    btrim(p_closure_id),
    v_review.claim_id,
    v_review.claim_reference,
    v_review.id,
    case when found then v_settlement.id else null end,
    v_outcome,
    v_review.closed_at,
    case when found then v_settlement.reconciled_at else null end,
    p_closed_at,
    btrim(p_actor_user_id),
    btrim(p_summary)
  )
  returning * into v_closure;

  insert into public.claim_retention_records (
    id,
    closure_id,
    claim_id,
    status,
    last_action_by_user_id
  ) values (
    btrim(p_retention_id),
    v_closure.id,
    v_closure.claim_id,
    'policy_pending',
    btrim(p_actor_user_id)
  );

  insert into public.claim_closure_audit (
    id,
    claim_id,
    closure_id,
    retention_id,
    action,
    actor_user_id,
    occurred_at,
    summary,
    detail
  ) values (
    'claim-closure-audit-final-' || gen_random_uuid()::text,
    v_closure.claim_id,
    v_closure.id,
    btrim(p_retention_id),
    'claim_final_closed',
    btrim(p_actor_user_id),
    p_closed_at,
    btrim(p_summary),
    jsonb_build_object(
      'finalOutcome', v_closure.final_outcome,
      'authorityReviewId', v_closure.authority_review_id,
      'recoverySettlementId', v_closure.recovery_settlement_id,
      'retentionStatus', 'policy_pending'
    )
  );

  return next v_closure;
  return;
end;
$$;

create or replace function public.schedule_claim_retention(
  p_retention_id text,
  p_actor_user_id text,
  p_scheduled_at timestamptz,
  p_retention_until timestamptz,
  p_policy_reference text,
  p_policy_basis text
)
returns setof public.claim_retention_records
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_retention public.claim_retention_records%rowtype;
  v_closure public.claim_closures%rowtype;
begin
  if p_actor_user_id is null or btrim(p_actor_user_id) = ''
     or p_scheduled_at is null
     or p_retention_until is null
     or p_policy_reference is null or btrim(p_policy_reference) = ''
     or p_policy_basis is null or btrim(p_policy_basis) = '' then
    raise exception 'retention actor, schedule timestamp, retention date, policy reference, and policy basis are required'
      using errcode = '22023';
  end if;

  select * into v_retention
  from public.claim_retention_records
  where id = p_retention_id
  for update;

  if not found then
    raise exception 'claim retention record not found'
      using errcode = 'P0002';
  end if;

  if v_retention.status <> 'policy_pending' then
    raise exception 'retention schedule may be created only from policy_pending state'
      using errcode = '42501';
  end if;

  select * into v_closure
  from public.claim_closures
  where id = v_retention.closure_id;

  if p_scheduled_at < v_closure.closed_at then
    raise exception 'retention scheduling cannot precede final claim closure'
      using errcode = '22023';
  end if;

  if p_retention_until < p_scheduled_at then
    raise exception 'retention-until timestamp cannot precede retention scheduling'
      using errcode = '22023';
  end if;

  update public.claim_retention_records
     set status = 'scheduled',
         policy_reference = btrim(p_policy_reference),
         policy_basis = btrim(p_policy_basis),
         scheduled_at = p_scheduled_at,
         retention_until = p_retention_until,
         last_action_by_user_id = btrim(p_actor_user_id)
   where id = v_retention.id
   returning * into v_retention;

  insert into public.claim_closure_audit (
    id,
    claim_id,
    closure_id,
    retention_id,
    action,
    actor_user_id,
    occurred_at,
    summary,
    detail
  ) values (
    'claim-closure-audit-retention-scheduled-' || gen_random_uuid()::text,
    v_retention.claim_id,
    v_retention.closure_id,
    v_retention.id,
    'retention_scheduled',
    btrim(p_actor_user_id),
    p_scheduled_at,
    'Claim retention schedule recorded from an explicit retention policy reference.',
    jsonb_build_object(
      'policyReference', btrim(p_policy_reference),
      'policyBasis', btrim(p_policy_basis),
      'retentionUntil', p_retention_until
    )
  );

  return next v_retention;
  return;
end;
$$;

create or replace function public.place_claim_retention_hold(
  p_retention_id text,
  p_actor_user_id text,
  p_occurred_at timestamptz,
  p_reason text
)
returns setof public.claim_retention_records
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_retention public.claim_retention_records%rowtype;
  v_closure public.claim_closures%rowtype;
begin
  if p_actor_user_id is null or btrim(p_actor_user_id) = ''
     or p_occurred_at is null
     or p_reason is null or btrim(p_reason) = '' then
    raise exception 'retention-hold actor, timestamp, and reason are required'
      using errcode = '22023';
  end if;

  select * into v_retention
  from public.claim_retention_records
  where id = p_retention_id
  for update;

  if not found then
    raise exception 'claim retention record not found'
      using errcode = 'P0002';
  end if;

  if v_retention.status not in (
    'policy_pending',
    'scheduled',
    'eligible_for_disposition'
  ) then
    raise exception 'retention hold is not permitted from the current retention state'
      using errcode = '42501';
  end if;

  select * into v_closure
  from public.claim_closures
  where id = v_retention.closure_id;

  if p_occurred_at < v_closure.closed_at then
    raise exception 'retention hold cannot precede final claim closure'
      using errcode = '22023';
  end if;

  update public.claim_retention_records
     set pre_hold_status = v_retention.status,
         status = 'legal_hold',
         active_hold_started_at = p_occurred_at,
         active_hold_reason = btrim(p_reason),
         active_hold_by_user_id = btrim(p_actor_user_id),
         last_action_by_user_id = btrim(p_actor_user_id)
   where id = v_retention.id
   returning * into v_retention;

  insert into public.claim_closure_audit (
    id,
    claim_id,
    closure_id,
    retention_id,
    action,
    actor_user_id,
    occurred_at,
    summary,
    detail
  ) values (
    'claim-closure-audit-hold-' || gen_random_uuid()::text,
    v_retention.claim_id,
    v_retention.closure_id,
    v_retention.id,
    'retention_hold_placed',
    btrim(p_actor_user_id),
    p_occurred_at,
    btrim(p_reason),
    jsonb_build_object(
      'preHoldStatus',
      v_retention.pre_hold_status
    )
  );

  return next v_retention;
  return;
end;
$$;

create or replace function public.release_claim_retention_hold(
  p_retention_id text,
  p_actor_user_id text,
  p_occurred_at timestamptz,
  p_summary text
)
returns setof public.claim_retention_records
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_retention public.claim_retention_records%rowtype;
  v_restore_status text;
begin
  if p_actor_user_id is null or btrim(p_actor_user_id) = ''
     or p_occurred_at is null
     or p_summary is null or btrim(p_summary) = '' then
    raise exception 'retention-hold release actor, timestamp, and summary are required'
      using errcode = '22023';
  end if;

  select * into v_retention
  from public.claim_retention_records
  where id = p_retention_id
  for update;

  if not found then
    raise exception 'claim retention record not found'
      using errcode = 'P0002';
  end if;

  if v_retention.status <> 'legal_hold'
     or v_retention.pre_hold_status is null
     or v_retention.active_hold_started_at is null then
    raise exception 'claim retention record is not under an active legal hold'
      using errcode = '42501';
  end if;

  if p_occurred_at < v_retention.active_hold_started_at then
    raise exception 'retention-hold release cannot precede hold placement'
      using errcode = '22023';
  end if;

  v_restore_status := v_retention.pre_hold_status;

  update public.claim_retention_records
     set status = v_restore_status,
         pre_hold_status = null,
         active_hold_started_at = null,
         active_hold_reason = null,
         active_hold_by_user_id = null,
         last_action_by_user_id = btrim(p_actor_user_id)
   where id = v_retention.id
   returning * into v_retention;

  insert into public.claim_closure_audit (
    id,
    claim_id,
    closure_id,
    retention_id,
    action,
    actor_user_id,
    occurred_at,
    summary,
    detail
  ) values (
    'claim-closure-audit-hold-release-' || gen_random_uuid()::text,
    v_retention.claim_id,
    v_retention.closure_id,
    v_retention.id,
    'retention_hold_released',
    btrim(p_actor_user_id),
    p_occurred_at,
    btrim(p_summary),
    jsonb_build_object(
      'restoredStatus',
      v_restore_status
    )
  );

  return next v_retention;
  return;
end;
$$;

create or replace function public.mark_claim_retention_eligible(
  p_retention_id text,
  p_actor_user_id text,
  p_occurred_at timestamptz,
  p_summary text
)
returns setof public.claim_retention_records
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_retention public.claim_retention_records%rowtype;
begin
  if p_actor_user_id is null or btrim(p_actor_user_id) = ''
     or p_occurred_at is null
     or p_summary is null or btrim(p_summary) = '' then
    raise exception 'retention eligibility actor, timestamp, and summary are required'
      using errcode = '22023';
  end if;

  select * into v_retention
  from public.claim_retention_records
  where id = p_retention_id
  for update;

  if not found then
    raise exception 'claim retention record not found'
      using errcode = 'P0002';
  end if;

  if v_retention.status <> 'scheduled'
     or v_retention.retention_until is null then
    raise exception 'retention eligibility requires an active retention schedule'
      using errcode = '42501';
  end if;

  if p_occurred_at < v_retention.retention_until then
    raise exception 'claim cannot become disposition-eligible before the retention-until timestamp'
      using errcode = '42501';
  end if;

  update public.claim_retention_records
     set status = 'eligible_for_disposition',
         eligible_at = p_occurred_at,
         last_action_by_user_id = btrim(p_actor_user_id)
   where id = v_retention.id
   returning * into v_retention;

  insert into public.claim_closure_audit (
    id,
    claim_id,
    closure_id,
    retention_id,
    action,
    actor_user_id,
    occurred_at,
    summary,
    detail
  ) values (
    'claim-closure-audit-retention-eligible-' || gen_random_uuid()::text,
    v_retention.claim_id,
    v_retention.closure_id,
    v_retention.id,
    'retention_eligible',
    btrim(p_actor_user_id),
    p_occurred_at,
    btrim(p_summary),
    jsonb_build_object(
      'retentionUntil',
      v_retention.retention_until
    )
  );

  return next v_retention;
  return;
end;
$$;

create or replace function public.record_claim_retention_disposition(
  p_retention_id text,
  p_actor_user_id text,
  p_occurred_at timestamptz,
  p_method text,
  p_summary text
)
returns setof public.claim_retention_records
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_retention public.claim_retention_records%rowtype;
begin
  if p_actor_user_id is null or btrim(p_actor_user_id) = ''
     or p_occurred_at is null
     or p_method is null or btrim(p_method) = ''
     or p_summary is null or btrim(p_summary) = '' then
    raise exception 'disposition actor, timestamp, method, and summary are required'
      using errcode = '22023';
  end if;

  select * into v_retention
  from public.claim_retention_records
  where id = p_retention_id
  for update;

  if not found then
    raise exception 'claim retention record not found'
      using errcode = 'P0002';
  end if;

  if v_retention.status <> 'eligible_for_disposition'
     or v_retention.eligible_at is null then
    raise exception 'claim is not eligible for retention disposition'
      using errcode = '42501';
  end if;

  if p_occurred_at < v_retention.eligible_at then
    raise exception 'retention disposition cannot precede disposition eligibility'
      using errcode = '22023';
  end if;

  update public.claim_retention_records
     set status = 'disposed',
         disposed_at = p_occurred_at,
         disposed_by_user_id = btrim(p_actor_user_id),
         disposition_method = btrim(p_method),
         disposition_summary = btrim(p_summary),
         last_action_by_user_id = btrim(p_actor_user_id)
   where id = v_retention.id
   returning * into v_retention;

  insert into public.claim_closure_audit (
    id,
    claim_id,
    closure_id,
    retention_id,
    action,
    actor_user_id,
    occurred_at,
    summary,
    detail
  ) values (
    'claim-closure-audit-retention-disposed-' || gen_random_uuid()::text,
    v_retention.claim_id,
    v_retention.closure_id,
    v_retention.id,
    'retention_disposed',
    btrim(p_actor_user_id),
    p_occurred_at,
    btrim(p_summary),
    jsonb_build_object(
      'method',
      btrim(p_method),
      'retentionUntil',
      v_retention.retention_until
    )
  );

  return next v_retention;
  return;
end;
$$;

revoke all on function public.close_claim_final(
  text,text,text,text,timestamptz,text
) from public, anon, authenticated;

revoke all on function public.schedule_claim_retention(
  text,text,timestamptz,timestamptz,text,text
) from public, anon, authenticated;

revoke all on function public.place_claim_retention_hold(
  text,text,timestamptz,text
) from public, anon, authenticated;

revoke all on function public.release_claim_retention_hold(
  text,text,timestamptz,text
) from public, anon, authenticated;

revoke all on function public.mark_claim_retention_eligible(
  text,text,timestamptz,text
) from public, anon, authenticated;

revoke all on function public.record_claim_retention_disposition(
  text,text,timestamptz,text,text
) from public, anon, authenticated;

grant execute on function public.close_claim_final(
  text,text,text,text,timestamptz,text
) to service_role;

grant execute on function public.schedule_claim_retention(
  text,text,timestamptz,timestamptz,text,text
) to service_role;

grant execute on function public.place_claim_retention_hold(
  text,text,timestamptz,text
) to service_role;

grant execute on function public.release_claim_retention_hold(
  text,text,timestamptz,text
) to service_role;

grant execute on function public.mark_claim_retention_eligible(
  text,text,timestamptz,text
) to service_role;

grant execute on function public.record_claim_retention_disposition(
  text,text,timestamptz,text,text
) to service_role;