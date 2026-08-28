begin;

create or replace function public.record_claim_authority_review_event(
  p_review_id text,
  p_action text,
  p_actor_user_id text,
  p_occurred_at timestamptz,
  p_external_reference text default null,
  p_summary text default null,
  p_approved_amount_cents bigint default null,
  p_denial_reason text default null,
  p_payment_reference text default null,
  p_payment_amount_cents bigint default null,
  p_recovered_amount_cents bigint default null,
  p_close_summary text default null
)
returns setof public.claim_authority_reviews
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_review public.claim_authority_reviews%rowtype;
  v_updated public.claim_authority_reviews%rowtype;
  v_summary text;
  v_detail jsonb;
begin
  if p_review_id is null or btrim(p_review_id) = '' then
    raise exception 'authority review id is required' using errcode = '22023';
  end if;

  if p_actor_user_id is null or btrim(p_actor_user_id) = '' then
    raise exception 'actor user id is required' using errcode = '22023';
  end if;

  if p_occurred_at is null then
    raise exception 'authority event timestamp is required' using errcode = '22023';
  end if;

  select * into v_review
  from public.claim_authority_reviews
  where id = p_review_id
  for update;

  if not found then
    raise exception 'authority review not found' using errcode = 'P0002';
  end if;

  if p_occurred_at < v_review.opened_at then
    raise exception 'authority event cannot precede claim submission' using errcode = '22023';
  end if;

  if p_action = 'authority_review_started' then
    if v_review.status <> 'acknowledged' then
      raise exception 'authority review can start only after acknowledgment' using errcode = '42501';
    end if;

    v_summary := coalesce(nullif(btrim(p_summary), ''), 'Authority review started.');

    update public.claim_authority_reviews
       set status = 'under_review',
           last_action_by_user_id = p_actor_user_id
     where id = p_review_id
     returning * into v_updated;

    v_detail := jsonb_build_object('status', 'under_review');

  elsif p_action = 'authority_approved' then
    if v_review.status not in ('acknowledged','under_review','additional_information_required') then
      raise exception 'authority approval is not permitted from the current review state' using errcode = '42501';
    end if;

    if p_summary is null or btrim(p_summary) = '' then
      raise exception 'authority approval summary is required' using errcode = '22023';
    end if;

    if p_approved_amount_cents is not null and p_approved_amount_cents < 0 then
      raise exception 'approved amount cannot be negative' using errcode = '22023';
    end if;

    v_summary := btrim(p_summary);

    update public.claim_authority_reviews
       set status = 'approved',
           decision_at = p_occurred_at,
           decision_reference = nullif(btrim(p_external_reference), ''),
           decision_summary = v_summary,
           approved_amount_cents = p_approved_amount_cents,
           denial_reason = null,
           last_action_by_user_id = p_actor_user_id
     where id = p_review_id
     returning * into v_updated;

    v_detail := jsonb_build_object(
      'status', 'approved',
      'approvedAmountCents', p_approved_amount_cents
    );

  elsif p_action = 'authority_denied' then
    if v_review.status not in ('acknowledged','under_review','additional_information_required') then
      raise exception 'authority denial is not permitted from the current review state' using errcode = '42501';
    end if;

    if p_denial_reason is null or btrim(p_denial_reason) = '' then
      raise exception 'authority denial reason is required' using errcode = '22023';
    end if;

    v_summary := coalesce(nullif(btrim(p_summary), ''), btrim(p_denial_reason));

    update public.claim_authority_reviews
       set status = 'denied',
           decision_at = p_occurred_at,
           decision_reference = nullif(btrim(p_external_reference), ''),
           decision_summary = v_summary,
           approved_amount_cents = null,
           denial_reason = btrim(p_denial_reason),
           last_action_by_user_id = p_actor_user_id
     where id = p_review_id
     returning * into v_updated;

    v_detail := jsonb_build_object(
      'status', 'denied',
      'denialReason', btrim(p_denial_reason)
    );

  elsif p_action = 'authority_payment_issued' then
    if v_review.status <> 'approved' then
      raise exception 'payment issuance requires an approved authority review' using errcode = '42501';
    end if;

    if p_payment_amount_cents is null or p_payment_amount_cents < 0 then
      raise exception 'payment amount is required and cannot be negative' using errcode = '22023';
    end if;

    v_summary := coalesce(nullif(btrim(p_summary), ''), 'Authority payment issuance recorded.');

    update public.claim_authority_reviews
       set status = 'payment_issued',
           payment_issued_at = p_occurred_at,
           payment_reference = nullif(btrim(p_payment_reference), ''),
           payment_amount_cents = p_payment_amount_cents,
           last_action_by_user_id = p_actor_user_id
     where id = p_review_id
     returning * into v_updated;

    v_detail := jsonb_build_object(
      'status', 'payment_issued',
      'paymentReference', nullif(btrim(p_payment_reference), ''),
      'paymentAmountCents', p_payment_amount_cents
    );

  elsif p_action = 'recovery_recorded' then
    if v_review.status <> 'payment_issued' then
      raise exception 'recovery can be recorded only after payment issuance' using errcode = '42501';
    end if;

    if p_recovered_amount_cents is null or p_recovered_amount_cents < 0 then
      raise exception 'recovered amount is required and cannot be negative' using errcode = '22023';
    end if;

    v_summary := coalesce(nullif(btrim(p_summary), ''), 'Recovery recorded.');

    update public.claim_authority_reviews
       set status = 'recovered',
           recovered_at = p_occurred_at,
           recovered_amount_cents = p_recovered_amount_cents,
           last_action_by_user_id = p_actor_user_id
     where id = p_review_id
     returning * into v_updated;

    v_detail := jsonb_build_object(
      'status', 'recovered',
      'recoveredAmountCents', p_recovered_amount_cents
    );

  elsif p_action = 'authority_review_closed' then
    if v_review.status not in ('approved','denied','payment_issued','recovered') then
      raise exception 'authority review cannot close from the current state' using errcode = '42501';
    end if;

    if p_close_summary is null or btrim(p_close_summary) = '' then
      raise exception 'closure summary is required' using errcode = '22023';
    end if;

    v_summary := btrim(p_close_summary);

    update public.claim_authority_reviews
       set status = 'closed',
           closed_at = p_occurred_at,
           close_summary = v_summary,
           last_action_by_user_id = p_actor_user_id
     where id = p_review_id
     returning * into v_updated;

    v_detail := jsonb_build_object('status', 'closed');

  else
    raise exception 'unsupported authority review action: %', p_action using errcode = '22023';
  end if;

  insert into public.claim_authority_review_audit (
    id,
    claim_id,
    authority_review_id,
    submission_id,
    action,
    actor_user_id,
    occurred_at,
    external_reference,
    summary,
    detail
  ) values (
    'authority-audit-' || p_action || '-' || gen_random_uuid()::text,
    v_updated.claim_id,
    v_updated.id,
    v_updated.submission_id,
    p_action,
    p_actor_user_id,
    p_occurred_at,
    nullif(btrim(p_external_reference), ''),
    v_summary,
    v_detail
  );

  return next v_updated;
  return;
end;
$function$;


create or replace function public.record_claim_authority_information_request(
  p_review_id text,
  p_request_id text,
  p_actor_user_id text,
  p_requested_at timestamptz,
  p_request_summary text,
  p_request_reference text default null,
  p_due_at timestamptz default null
)
returns setof public.claim_authority_information_requests
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_review public.claim_authority_reviews%rowtype;
  v_request public.claim_authority_information_requests%rowtype;
begin
  if p_request_id is null or btrim(p_request_id) = '' then
    raise exception 'information request id is required' using errcode = '22023';
  end if;

  if p_actor_user_id is null or btrim(p_actor_user_id) = '' then
    raise exception 'actor user id is required' using errcode = '22023';
  end if;

  if p_request_summary is null or btrim(p_request_summary) = '' then
    raise exception 'information request summary is required' using errcode = '22023';
  end if;

  select * into v_review
  from public.claim_authority_reviews
  where id = p_review_id
  for update;

  if not found then
    raise exception 'authority review not found' using errcode = 'P0002';
  end if;

  if v_review.status not in ('acknowledged','under_review','additional_information_required') then
    raise exception 'authority information request is not permitted from the current review state' using errcode = '42501';
  end if;

  insert into public.claim_authority_information_requests (
    id,
    authority_review_id,
    claim_id,
    submission_id,
    request_reference,
    request_summary,
    requested_at,
    due_at,
    status,
    recorded_by_user_id
  ) values (
    p_request_id,
    v_review.id,
    v_review.claim_id,
    v_review.submission_id,
    nullif(btrim(p_request_reference), ''),
    btrim(p_request_summary),
    p_requested_at,
    p_due_at,
    'open',
    p_actor_user_id
  )
  returning * into v_request;

  update public.claim_authority_reviews
     set status = 'additional_information_required',
         last_action_by_user_id = p_actor_user_id
   where id = v_review.id;

  insert into public.claim_authority_review_audit (
    id,
    claim_id,
    authority_review_id,
    submission_id,
    action,
    actor_user_id,
    occurred_at,
    external_reference,
    summary,
    detail
  ) values (
    'authority-audit-info-requested-' || gen_random_uuid()::text,
    v_review.claim_id,
    v_review.id,
    v_review.submission_id,
    'authority_information_requested',
    p_actor_user_id,
    p_requested_at,
    nullif(btrim(p_request_reference), ''),
    btrim(p_request_summary),
    jsonb_build_object('requestId', v_request.id, 'dueAt', p_due_at)
  );

  return next v_request;
  return;
end;
$function$;


create or replace function public.respond_claim_authority_information_request(
  p_request_id text,
  p_actor_user_id text,
  p_responded_at timestamptz,
  p_response_summary text,
  p_response_reference text default null
)
returns setof public.claim_authority_information_requests
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_request public.claim_authority_information_requests%rowtype;
  v_updated public.claim_authority_information_requests%rowtype;
begin
  if p_actor_user_id is null or btrim(p_actor_user_id) = '' then
    raise exception 'actor user id is required' using errcode = '22023';
  end if;

  if p_response_summary is null or btrim(p_response_summary) = '' then
    raise exception 'information response summary is required' using errcode = '22023';
  end if;

  select * into v_request
  from public.claim_authority_information_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'authority information request not found' using errcode = 'P0002';
  end if;

  if v_request.status <> 'open' then
    raise exception 'only an open authority information request can be responded to' using errcode = '42501';
  end if;

  update public.claim_authority_information_requests
     set status = 'responded',
         responded_at = p_responded_at,
         response_reference = nullif(btrim(p_response_reference), ''),
         response_summary = btrim(p_response_summary),
         responded_by_user_id = p_actor_user_id
   where id = p_request_id
   returning * into v_updated;

  update public.claim_authority_reviews
     set last_action_by_user_id = p_actor_user_id
   where id = v_updated.authority_review_id;

  insert into public.claim_authority_review_audit (
    id,
    claim_id,
    authority_review_id,
    submission_id,
    action,
    actor_user_id,
    occurred_at,
    external_reference,
    summary,
    detail
  ) values (
    'authority-audit-info-responded-' || gen_random_uuid()::text,
    v_updated.claim_id,
    v_updated.authority_review_id,
    v_updated.submission_id,
    'authority_information_responded',
    p_actor_user_id,
    p_responded_at,
    nullif(btrim(p_response_reference), ''),
    btrim(p_response_summary),
    jsonb_build_object('requestId', v_updated.id)
  );

  return next v_updated;
  return;
end;
$function$;


create or replace function public.resolve_claim_authority_information_request(
  p_request_id text,
  p_actor_user_id text,
  p_occurred_at timestamptz,
  p_resolution text,
  p_summary text default null
)
returns setof public.claim_authority_information_requests
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_request public.claim_authority_information_requests%rowtype;
  v_updated public.claim_authority_information_requests%rowtype;
  v_remaining bigint;
  v_action text;
  v_summary text;
begin
  if p_actor_user_id is null or btrim(p_actor_user_id) = '' then
    raise exception 'actor user id is required' using errcode = '22023';
  end if;

  if p_resolution not in ('satisfied','withdrawn') then
    raise exception 'resolution must be satisfied or withdrawn' using errcode = '22023';
  end if;

  select * into v_request
  from public.claim_authority_information_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'authority information request not found' using errcode = 'P0002';
  end if;

  if p_resolution = 'satisfied' then
    if v_request.status <> 'responded' then
      raise exception 'only a responded authority information request can be marked satisfied' using errcode = '42501';
    end if;

    update public.claim_authority_information_requests
       set status = 'satisfied',
           satisfied_at = p_occurred_at
     where id = p_request_id
     returning * into v_updated;

    v_action := 'authority_information_satisfied';
    v_summary := coalesce(nullif(btrim(p_summary), ''), 'Authority information request satisfied.');
  else
    if v_request.status <> 'open' then
      raise exception 'only an open authority information request can be withdrawn' using errcode = '42501';
    end if;

    update public.claim_authority_information_requests
       set status = 'withdrawn'
     where id = p_request_id
     returning * into v_updated;

    v_action := 'authority_information_withdrawn';
    v_summary := coalesce(nullif(btrim(p_summary), ''), 'Authority information request withdrawn.');
  end if;

  select count(*) into v_remaining
  from public.claim_authority_information_requests
  where authority_review_id = v_updated.authority_review_id
    and id <> v_updated.id
    and status in ('open','responded');

  if v_remaining = 0 then
    update public.claim_authority_reviews
       set status = 'under_review',
           last_action_by_user_id = p_actor_user_id
     where id = v_updated.authority_review_id
       and status = 'additional_information_required';
  else
    update public.claim_authority_reviews
       set last_action_by_user_id = p_actor_user_id
     where id = v_updated.authority_review_id;
  end if;

  insert into public.claim_authority_review_audit (
    id,
    claim_id,
    authority_review_id,
    submission_id,
    action,
    actor_user_id,
    occurred_at,
    summary,
    detail
  ) values (
    'authority-audit-info-resolved-' || gen_random_uuid()::text,
    v_updated.claim_id,
    v_updated.authority_review_id,
    v_updated.submission_id,
    v_action,
    p_actor_user_id,
    p_occurred_at,
    v_summary,
    jsonb_build_object('requestId', v_updated.id, 'resolution', p_resolution)
  );

  return next v_updated;
  return;
end;
$function$;

revoke all on function public.record_claim_authority_review_event(text,text,text,timestamptz,text,text,bigint,text,text,bigint,bigint,text) from public, anon, authenticated;
revoke all on function public.record_claim_authority_information_request(text,text,text,timestamptz,text,text,timestamptz) from public, anon, authenticated;
revoke all on function public.respond_claim_authority_information_request(text,text,timestamptz,text,text) from public, anon, authenticated;
revoke all on function public.resolve_claim_authority_information_request(text,text,timestamptz,text,text) from public, anon, authenticated;

grant execute on function public.record_claim_authority_review_event(text,text,text,timestamptz,text,text,bigint,text,text,bigint,bigint,text) to service_role;
grant execute on function public.record_claim_authority_information_request(text,text,text,timestamptz,text,text,timestamptz) to service_role;
grant execute on function public.respond_claim_authority_information_request(text,text,timestamptz,text,text) to service_role;
grant execute on function public.resolve_claim_authority_information_request(text,text,timestamptz,text,text) to service_role;

commit;