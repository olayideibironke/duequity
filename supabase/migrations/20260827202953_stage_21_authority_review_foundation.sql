begin;

create table public.claim_authority_reviews (
  id text primary key,
  claim_id text not null,
  claim_reference text not null,
  submission_id text not null unique,
  filing_package_id text not null,
  filing_package_version bigint not null,
  filing_destination_id text not null,
  filing_destination_version bigint not null,
  filing_destination_snapshot_hash text not null,
  authority_name text not null,
  submission_method text not null,
  status text not null default 'awaiting_acknowledgment',
  opened_at timestamptz not null,
  acknowledged_at timestamptz,
  decision_at timestamptz,
  decision_reference text,
  decision_summary text,
  approved_amount_cents bigint,
  denial_reason text,
  payment_issued_at timestamptz,
  payment_reference text,
  payment_amount_cents bigint,
  recovered_at timestamptz,
  recovered_amount_cents bigint,
  closed_at timestamptz,
  close_summary text,
  last_action_by_user_id text not null,
  row_version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint claim_authority_reviews_claim_fk
    foreign key (claim_id)
    references public.claimant_onboarding(claim_id)
    on update restrict on delete restrict,

  constraint claim_authority_reviews_submission_fk
    foreign key (submission_id)
    references public.claim_submissions(id)
    on update restrict on delete restrict,

  constraint claim_authority_reviews_filing_package_fk
    foreign key (filing_package_id)
    references public.claim_filing_packages(id)
    on update restrict on delete restrict,

  constraint claim_authority_reviews_filing_destination_fk
    foreign key (filing_destination_id)
    references public.jurisdiction_filing_destinations(id)
    on update restrict on delete restrict,

  constraint claim_authority_reviews_id_chk
    check (btrim(id) <> ''),

  constraint claim_authority_reviews_claim_reference_chk
    check (btrim(claim_reference) <> ''),

  constraint claim_authority_reviews_authority_name_chk
    check (btrim(authority_name) <> ''),

  constraint claim_authority_reviews_submission_method_chk
    check (btrim(submission_method) <> ''),

  constraint claim_authority_reviews_actor_chk
    check (btrim(last_action_by_user_id) <> ''),

  constraint claim_authority_reviews_package_version_chk
    check (filing_package_version >= 1),

  constraint claim_authority_reviews_destination_version_chk
    check (filing_destination_version >= 1),

  constraint claim_authority_reviews_destination_hash_chk
    check (filing_destination_snapshot_hash ~ '^[0-9a-f]{64}$'),

  constraint claim_authority_reviews_status_chk
    check (status in (
      'awaiting_acknowledgment',
      'acknowledged',
      'under_review',
      'additional_information_required',
      'approved',
      'denied',
      'payment_issued',
      'recovered',
      'closed'
    )),

  constraint claim_authority_reviews_amounts_chk
    check (
      (approved_amount_cents is null or approved_amount_cents >= 0)
      and (payment_amount_cents is null or payment_amount_cents >= 0)
      and (recovered_amount_cents is null or recovered_amount_cents >= 0)
    ),

  constraint claim_authority_reviews_optional_text_chk
    check (
      (decision_reference is null or btrim(decision_reference) <> '')
      and (decision_summary is null or btrim(decision_summary) <> '')
      and (denial_reason is null or btrim(denial_reason) <> '')
      and (payment_reference is null or btrim(payment_reference) <> '')
      and (close_summary is null or btrim(close_summary) <> '')
    ),

  constraint claim_authority_reviews_chronology_chk
    check (
      (acknowledged_at is null or acknowledged_at >= opened_at)
      and (decision_at is null or decision_at >= coalesce(acknowledged_at, opened_at))
      and (payment_issued_at is null or payment_issued_at >= coalesce(decision_at, acknowledged_at, opened_at))
      and (recovered_at is null or recovered_at >= coalesce(payment_issued_at, decision_at, acknowledged_at, opened_at))
      and (closed_at is null or closed_at >= coalesce(recovered_at, payment_issued_at, decision_at, acknowledged_at, opened_at))
    ),

  constraint claim_authority_reviews_state_fields_chk
    check (
      (status = 'awaiting_acknowledgment'
        and acknowledged_at is null
        and decision_at is null
        and payment_issued_at is null
        and recovered_at is null
        and closed_at is null)
      or
      (status in ('acknowledged','under_review','additional_information_required')
        and acknowledged_at is not null
        and decision_at is null
        and payment_issued_at is null
        and recovered_at is null
        and closed_at is null)
      or
      (status = 'approved'
        and acknowledged_at is not null
        and decision_at is not null
        and decision_summary is not null
        and denial_reason is null
        and payment_issued_at is null
        and recovered_at is null
        and closed_at is null)
      or
      (status = 'denied'
        and acknowledged_at is not null
        and decision_at is not null
        and denial_reason is not null
        and payment_issued_at is null
        and recovered_at is null
        and closed_at is null)
      or
      (status = 'payment_issued'
        and acknowledged_at is not null
        and decision_at is not null
        and denial_reason is null
        and payment_issued_at is not null
        and payment_amount_cents is not null
        and recovered_at is null
        and closed_at is null)
      or
      (status = 'recovered'
        and acknowledged_at is not null
        and decision_at is not null
        and denial_reason is null
        and payment_issued_at is not null
        and payment_amount_cents is not null
        and recovered_at is not null
        and recovered_amount_cents is not null
        and closed_at is null)
      or
      (status = 'closed'
        and closed_at is not null
        and close_summary is not null)
    ),

  constraint claim_authority_reviews_row_version_chk
    check (row_version >= 1)
);

create index claim_authority_reviews_claim_idx
  on public.claim_authority_reviews (claim_id);

create index claim_authority_reviews_status_idx
  on public.claim_authority_reviews (status, updated_at desc);


create table public.claim_authority_information_requests (
  id text primary key,
  authority_review_id text not null,
  claim_id text not null,
  submission_id text not null,
  request_reference text,
  request_summary text not null,
  requested_at timestamptz not null,
  due_at timestamptz,
  status text not null default 'open',
  response_reference text,
  response_summary text,
  responded_at timestamptz,
  satisfied_at timestamptz,
  recorded_by_user_id text not null,
  responded_by_user_id text,
  row_version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint claim_authority_info_review_fk
    foreign key (authority_review_id)
    references public.claim_authority_reviews(id)
    on update restrict on delete restrict,

  constraint claim_authority_info_claim_fk
    foreign key (claim_id)
    references public.claimant_onboarding(claim_id)
    on update restrict on delete restrict,

  constraint claim_authority_info_submission_fk
    foreign key (submission_id)
    references public.claim_submissions(id)
    on update restrict on delete restrict,

  constraint claim_authority_info_id_chk
    check (btrim(id) <> ''),

  constraint claim_authority_info_summary_chk
    check (btrim(request_summary) <> ''),

  constraint claim_authority_info_request_reference_chk
    check (request_reference is null or btrim(request_reference) <> ''),

  constraint claim_authority_info_response_reference_chk
    check (response_reference is null or btrim(response_reference) <> ''),

  constraint claim_authority_info_response_summary_chk
    check (response_summary is null or btrim(response_summary) <> ''),

  constraint claim_authority_info_recorded_by_chk
    check (btrim(recorded_by_user_id) <> ''),

  constraint claim_authority_info_responded_by_chk
    check (responded_by_user_id is null or btrim(responded_by_user_id) <> ''),

  constraint claim_authority_info_status_chk
    check (status in ('open','responded','satisfied','withdrawn')),

  constraint claim_authority_info_chronology_chk
    check (
      (due_at is null or due_at >= requested_at)
      and (responded_at is null or responded_at >= requested_at)
      and (satisfied_at is null or satisfied_at >= coalesce(responded_at, requested_at))
    ),

  constraint claim_authority_info_state_chk
    check (
      (status = 'open'
        and responded_at is null
        and response_summary is null
        and responded_by_user_id is null
        and satisfied_at is null)
      or
      (status = 'responded'
        and responded_at is not null
        and response_summary is not null
        and responded_by_user_id is not null
        and satisfied_at is null)
      or
      (status = 'satisfied'
        and responded_at is not null
        and response_summary is not null
        and responded_by_user_id is not null
        and satisfied_at is not null)
      or
      (status = 'withdrawn'
        and satisfied_at is null)
    ),

  constraint claim_authority_info_row_version_chk
    check (row_version >= 1)
);

create index claim_authority_info_review_idx
  on public.claim_authority_information_requests (authority_review_id, requested_at desc);

create index claim_authority_info_status_idx
  on public.claim_authority_information_requests (status, due_at);


create table public.claim_authority_review_audit (
  id text primary key,
  claim_id text not null,
  authority_review_id text not null,
  submission_id text not null,
  action text not null,
  actor_user_id text not null,
  occurred_at timestamptz not null,
  external_reference text,
  summary text,
  detail jsonb,
  created_at timestamptz not null default now(),

  constraint claim_authority_audit_review_fk
    foreign key (authority_review_id)
    references public.claim_authority_reviews(id)
    on update restrict on delete restrict,

  constraint claim_authority_audit_submission_fk
    foreign key (submission_id)
    references public.claim_submissions(id)
    on update restrict on delete restrict,

  constraint claim_authority_audit_claim_fk
    foreign key (claim_id)
    references public.claimant_onboarding(claim_id)
    on update restrict on delete restrict,

  constraint claim_authority_audit_id_chk
    check (btrim(id) <> ''),

  constraint claim_authority_audit_actor_chk
    check (btrim(actor_user_id) <> ''),

  constraint claim_authority_audit_action_chk
    check (action in (
      'authority_review_opened',
      'authority_acknowledged',
      'authority_review_started',
      'authority_information_requested',
      'authority_information_responded',
      'authority_information_satisfied',
      'authority_information_withdrawn',
      'authority_approved',
      'authority_denied',
      'authority_payment_issued',
      'recovery_recorded',
      'authority_review_closed'
    )),

  constraint claim_authority_audit_external_reference_chk
    check (external_reference is null or btrim(external_reference) <> ''),

  constraint claim_authority_audit_summary_chk
    check (summary is null or btrim(summary) <> ''),

  constraint claim_authority_audit_detail_chk
    check (detail is null or jsonb_typeof(detail) = 'object')
);

create index claim_authority_audit_claim_idx
  on public.claim_authority_review_audit (claim_id, occurred_at desc);

create index claim_authority_audit_review_idx
  on public.claim_authority_review_audit (authority_review_id, occurred_at desc);


create or replace function public.guard_claim_authority_review_insert()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
declare
  v_submission public.claim_submissions%rowtype;
begin
  select * into v_submission
  from public.claim_submissions
  where id = new.submission_id;

  if not found then
    raise exception 'claim submission not found for authority review'
      using errcode = '23503';
  end if;

  if new.claim_id is distinct from v_submission.claim_id
     or new.claim_reference is distinct from v_submission.claim_reference
     or new.filing_package_id is distinct from v_submission.filing_package_id
     or new.filing_package_version is distinct from v_submission.filing_package_version
     or new.filing_destination_id is distinct from v_submission.filing_destination_id
     or new.filing_destination_version is distinct from v_submission.filing_destination_version
     or new.filing_destination_snapshot_hash is distinct from v_submission.filing_destination_snapshot_hash
     or new.authority_name is distinct from v_submission.authority_name
     or new.submission_method is distinct from v_submission.submission_method
     or new.opened_at is distinct from v_submission.submitted_at then
    raise exception 'authority review provenance does not match claim submission'
      using errcode = '42501';
  end if;

  if v_submission.status = 'submitted' then
    if new.status <> 'awaiting_acknowledgment' or new.acknowledged_at is not null then
      raise exception 'new authority review must await acknowledgment for an unacknowledged submission'
        using errcode = '42501';
    end if;
  elsif v_submission.status = 'acknowledged' then
    if new.status <> 'acknowledged'
       or new.acknowledged_at is distinct from v_submission.acknowledged_at then
      raise exception 'new authority review must mirror existing submission acknowledgment'
        using errcode = '42501';
    end if;
  else
    raise exception 'unsupported claim submission state for authority review'
      using errcode = '42501';
  end if;

  return new;
end;
$function$;

create or replace function public.guard_claim_authority_review_update()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
begin
  if new.id is distinct from old.id
     or new.claim_id is distinct from old.claim_id
     or new.claim_reference is distinct from old.claim_reference
     or new.submission_id is distinct from old.submission_id
     or new.filing_package_id is distinct from old.filing_package_id
     or new.filing_package_version is distinct from old.filing_package_version
     or new.filing_destination_id is distinct from old.filing_destination_id
     or new.filing_destination_version is distinct from old.filing_destination_version
     or new.filing_destination_snapshot_hash is distinct from old.filing_destination_snapshot_hash
     or new.authority_name is distinct from old.authority_name
     or new.submission_method is distinct from old.submission_method
     or new.opened_at is distinct from old.opened_at
     or new.created_at is distinct from old.created_at then
    raise exception 'authority review provenance is immutable'
      using errcode = '42501';
  end if;

  if new.status is distinct from old.status then
    if not (
      (old.status = 'awaiting_acknowledgment' and new.status = 'acknowledged')
      or (old.status = 'acknowledged' and new.status in ('under_review','additional_information_required','approved','denied'))
      or (old.status = 'under_review' and new.status in ('additional_information_required','approved','denied'))
      or (old.status = 'additional_information_required' and new.status in ('under_review','approved','denied'))
      or (old.status = 'approved' and new.status in ('payment_issued','closed'))
      or (old.status = 'denied' and new.status = 'closed')
      or (old.status = 'payment_issued' and new.status in ('recovered','closed'))
      or (old.status = 'recovered' and new.status = 'closed')
    ) then
      raise exception 'invalid authority review state transition from % to %', old.status, new.status
        using errcode = '42501';
    end if;
  end if;

  if old.status = 'closed' then
    raise exception 'closed authority review is terminal'
      using errcode = '42501';
  end if;

  new.row_version := old.row_version + 1;
  new.updated_at := pg_catalog.clock_timestamp();

  return new;
end;
$function$;

create or replace function public.reject_claim_authority_review_delete()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
begin
  raise exception 'claim authority reviews are immutable operational records and cannot be deleted'
    using errcode = '42501';
end;
$function$;

create trigger claim_authority_reviews_insert_guard
before insert on public.claim_authority_reviews
for each row execute function public.guard_claim_authority_review_insert();

create trigger claim_authority_reviews_update_guard
before update on public.claim_authority_reviews
for each row execute function public.guard_claim_authority_review_update();

create trigger claim_authority_reviews_delete_guard
before delete on public.claim_authority_reviews
for each row execute function public.reject_claim_authority_review_delete();


create or replace function public.guard_claim_authority_information_request_insert()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
declare
  v_review public.claim_authority_reviews%rowtype;
begin
  select * into v_review
  from public.claim_authority_reviews
  where id = new.authority_review_id;

  if not found then
    raise exception 'authority review not found for information request'
      using errcode = '23503';
  end if;

  if new.claim_id is distinct from v_review.claim_id
     or new.submission_id is distinct from v_review.submission_id then
    raise exception 'authority information request does not match authority review provenance'
      using errcode = '42501';
  end if;

  if v_review.status in ('approved','denied','payment_issued','recovered','closed') then
    raise exception 'cannot open an authority information request after authority decision or closure'
      using errcode = '42501';
  end if;

  if new.status <> 'open'
     or new.responded_at is not null
     or new.response_reference is not null
     or new.response_summary is not null
     or new.responded_by_user_id is not null
     or new.satisfied_at is not null then
    raise exception 'new authority information request must begin open with no response fields'
      using errcode = '42501';
  end if;

  if new.requested_at < v_review.opened_at then
    raise exception 'authority information request cannot precede claim submission'
      using errcode = '42501';
  end if;

  return new;
end;
$function$;

create or replace function public.guard_claim_authority_information_request_update()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
begin
  if new.id is distinct from old.id
     or new.authority_review_id is distinct from old.authority_review_id
     or new.claim_id is distinct from old.claim_id
     or new.submission_id is distinct from old.submission_id
     or new.request_reference is distinct from old.request_reference
     or new.request_summary is distinct from old.request_summary
     or new.requested_at is distinct from old.requested_at
     or new.due_at is distinct from old.due_at
     or new.recorded_by_user_id is distinct from old.recorded_by_user_id
     or new.created_at is distinct from old.created_at then
    raise exception 'authority information-request provenance and original request facts are immutable'
      using errcode = '42501';
  end if;

  if new.status is distinct from old.status then
    if not (
      (old.status = 'open' and new.status in ('responded','withdrawn'))
      or (old.status = 'responded' and new.status = 'satisfied')
    ) then
      raise exception 'invalid authority information-request state transition from % to %', old.status, new.status
        using errcode = '42501';
    end if;
  end if;

  if old.status in ('satisfied','withdrawn') then
    raise exception 'completed authority information request is terminal'
      using errcode = '42501';
  end if;

  new.row_version := old.row_version + 1;
  new.updated_at := pg_catalog.clock_timestamp();

  return new;
end;
$function$;

create or replace function public.reject_claim_authority_information_request_delete()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
begin
  raise exception 'claim authority information requests cannot be deleted'
    using errcode = '42501';
end;
$function$;

create trigger claim_authority_info_insert_guard
before insert on public.claim_authority_information_requests
for each row execute function public.guard_claim_authority_information_request_insert();

create trigger claim_authority_info_update_guard
before update on public.claim_authority_information_requests
for each row execute function public.guard_claim_authority_information_request_update();

create trigger claim_authority_info_delete_guard
before delete on public.claim_authority_information_requests
for each row execute function public.reject_claim_authority_information_request_delete();


create or replace function public.reject_claim_authority_review_audit_change()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
begin
  raise exception 'claim authority review audit is append-only'
    using errcode = '42501';
end;
$function$;

create trigger claim_authority_audit_update_guard
before update on public.claim_authority_review_audit
for each row execute function public.reject_claim_authority_review_audit_change();

create trigger claim_authority_audit_delete_guard
before delete on public.claim_authority_review_audit
for each row execute function public.reject_claim_authority_review_audit_change();


create or replace function public.bootstrap_claim_authority_review_from_submission()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_review_id text;
begin
  v_review_id := 'authority-review-' || new.id;

  insert into public.claim_authority_reviews (
    id,
    claim_id,
    claim_reference,
    submission_id,
    filing_package_id,
    filing_package_version,
    filing_destination_id,
    filing_destination_version,
    filing_destination_snapshot_hash,
    authority_name,
    submission_method,
    status,
    opened_at,
    acknowledged_at,
    last_action_by_user_id
  ) values (
    v_review_id,
    new.claim_id,
    new.claim_reference,
    new.id,
    new.filing_package_id,
    new.filing_package_version,
    new.filing_destination_id,
    new.filing_destination_version,
    new.filing_destination_snapshot_hash,
    new.authority_name,
    new.submission_method,
    case when new.status = 'acknowledged' then 'acknowledged' else 'awaiting_acknowledgment' end,
    new.submitted_at,
    new.acknowledged_at,
    case
      when new.status = 'acknowledged' then coalesce(new.acknowledgment_recorded_by_user_id, new.recorded_by_user_id)
      else new.recorded_by_user_id
    end
  );

  insert into public.claim_authority_review_audit (
    id,
    claim_id,
    authority_review_id,
    submission_id,
    action,
    actor_user_id,
    occurred_at,
    summary
  ) values (
    'authority-audit-opened-' || new.id,
    new.claim_id,
    v_review_id,
    new.id,
    'authority_review_opened',
    new.recorded_by_user_id,
    new.submitted_at,
    'Authority review lifecycle opened from the durable external submission record.'
  );

  if new.status = 'acknowledged' then
    insert into public.claim_authority_review_audit (
      id,
      claim_id,
      authority_review_id,
      submission_id,
      action,
      actor_user_id,
      occurred_at,
      external_reference,
      summary
    ) values (
      'authority-audit-ack-' || new.id,
      new.claim_id,
      v_review_id,
      new.id,
      'authority_acknowledged',
      coalesce(new.acknowledgment_recorded_by_user_id, new.recorded_by_user_id),
      new.acknowledged_at,
      new.acknowledgment_reference,
      coalesce(new.acknowledgment_summary, 'Authority acknowledgment recorded.')
    );
  end if;

  return new;
end;
$function$;

create or replace function public.sync_claim_authority_review_acknowledgment()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_review_id text;
begin
  if old.status = 'submitted' and new.status = 'acknowledged' then
    select id into v_review_id
    from public.claim_authority_reviews
    where submission_id = new.id;

    if v_review_id is null then
      raise exception 'authority review missing for acknowledged claim submission'
        using errcode = '23503';
    end if;

    update public.claim_authority_reviews
       set status = 'acknowledged',
           acknowledged_at = new.acknowledged_at,
           last_action_by_user_id = new.acknowledgment_recorded_by_user_id
     where id = v_review_id;

    insert into public.claim_authority_review_audit (
      id,
      claim_id,
      authority_review_id,
      submission_id,
      action,
      actor_user_id,
      occurred_at,
      external_reference,
      summary
    ) values (
      'authority-audit-ack-' || new.id,
      new.claim_id,
      v_review_id,
      new.id,
      'authority_acknowledged',
      new.acknowledgment_recorded_by_user_id,
      new.acknowledged_at,
      new.acknowledgment_reference,
      coalesce(new.acknowledgment_summary, 'Authority acknowledgment recorded.')
    );
  end if;

  return new;
end;
$function$;

create trigger claim_submissions_authority_review_bootstrap
after insert on public.claim_submissions
for each row execute function public.bootstrap_claim_authority_review_from_submission();

create trigger claim_submissions_authority_review_ack_sync
after update on public.claim_submissions
for each row execute function public.sync_claim_authority_review_acknowledgment();


alter table public.claim_authority_reviews enable row level security;
alter table public.claim_authority_information_requests enable row level security;
alter table public.claim_authority_review_audit enable row level security;

revoke all on public.claim_authority_reviews from public, anon, authenticated;
revoke all on public.claim_authority_information_requests from public, anon, authenticated;
revoke all on public.claim_authority_review_audit from public, anon, authenticated;

grant select, insert, update on public.claim_authority_reviews to service_role;
grant select, insert, update on public.claim_authority_information_requests to service_role;
grant select, insert on public.claim_authority_review_audit to service_role;

revoke execute on function public.guard_claim_authority_review_insert() from public, anon, authenticated;
revoke execute on function public.guard_claim_authority_review_update() from public, anon, authenticated;
revoke execute on function public.reject_claim_authority_review_delete() from public, anon, authenticated;
revoke execute on function public.guard_claim_authority_information_request_insert() from public, anon, authenticated;
revoke execute on function public.guard_claim_authority_information_request_update() from public, anon, authenticated;
revoke execute on function public.reject_claim_authority_information_request_delete() from public, anon, authenticated;
revoke execute on function public.reject_claim_authority_review_audit_change() from public, anon, authenticated;
revoke execute on function public.bootstrap_claim_authority_review_from_submission() from public, anon, authenticated;
revoke execute on function public.sync_claim_authority_review_acknowledgment() from public, anon, authenticated;

commit;;
