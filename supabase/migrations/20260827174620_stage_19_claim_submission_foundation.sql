create table public.claim_submissions (
  id text primary key,
  claim_id text not null,
  claim_reference text not null,
  filing_package_id text not null,
  filing_package_version bigint not null,
  route_mode text not null,
  filing_party text not null,
  authority_name text not null,
  custodian text not null,
  submission_method text not null,
  status text not null default 'submitted',
  submitted_at timestamptz not null,
  recorded_by_user_id text not null,
  external_reference text,
  submission_note text,
  acknowledged_at timestamptz,
  acknowledgment_recorded_by_user_id text,
  acknowledgment_reference text,
  acknowledgment_summary text,
  row_version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint claim_submissions_id_chk
    check (btrim(id) <> ''),
  constraint claim_submissions_claim_reference_chk
    check (btrim(claim_reference) <> ''),
  constraint claim_submissions_version_chk
    check (filing_package_version >= 1),
  constraint claim_submissions_route_mode_chk
    check (route_mode in ('claimant_controlled', 'representative_controlled')),
  constraint claim_submissions_filing_party_chk
    check (filing_party in ('claimant', 'authorized_representative')),
  constraint claim_submissions_route_party_chk
    check (
      (route_mode = 'claimant_controlled' and filing_party = 'claimant')
      or
      (route_mode = 'representative_controlled' and filing_party = 'authorized_representative')
    ),
  constraint claim_submissions_authority_name_chk
    check (btrim(authority_name) <> ''),
  constraint claim_submissions_custodian_chk
    check (btrim(custodian) <> ''),
  constraint claim_submissions_submission_method_chk
    check (btrim(submission_method) <> ''),
  constraint claim_submissions_status_chk
    check (status in ('submitted', 'acknowledged')),
  constraint claim_submissions_recorded_by_chk
    check (btrim(recorded_by_user_id) <> ''),
  constraint claim_submissions_external_reference_chk
    check (external_reference is null or btrim(external_reference) <> ''),
  constraint claim_submissions_submission_note_chk
    check (submission_note is null or btrim(submission_note) <> ''),
  constraint claim_submissions_ack_recorded_by_chk
    check (
      acknowledgment_recorded_by_user_id is null
      or btrim(acknowledgment_recorded_by_user_id) <> ''
    ),
  constraint claim_submissions_ack_reference_chk
    check (
      acknowledgment_reference is null
      or btrim(acknowledgment_reference) <> ''
    ),
  constraint claim_submissions_ack_summary_chk
    check (
      acknowledgment_summary is null
      or btrim(acknowledgment_summary) <> ''
    ),
  constraint claim_submissions_row_version_chk
    check (row_version >= 1),
  constraint claim_submissions_ack_state_chk
    check (
      (
        status = 'submitted'
        and acknowledged_at is null
        and acknowledgment_recorded_by_user_id is null
        and acknowledgment_reference is null
        and acknowledgment_summary is null
      )
      or
      (
        status = 'acknowledged'
        and acknowledged_at is not null
        and acknowledgment_recorded_by_user_id is not null
        and acknowledged_at >= submitted_at
      )
    ),
  constraint claim_submissions_claim_fk
    foreign key (claim_id)
    references public.claimant_onboarding(claim_id)
    on update restrict
    on delete restrict,
  constraint claim_submissions_filing_package_fk
    foreign key (filing_package_id)
    references public.claim_filing_packages(id)
    on update restrict
    on delete restrict,
  constraint claim_submissions_one_per_claim_key
    unique (claim_id)
);

create table public.claim_submission_audit (
  id text primary key,
  claim_id text not null,
  submission_id text not null,
  action text not null,
  actor_user_id text not null,
  occurred_at timestamptz not null,
  detail text,

  constraint claim_submission_audit_id_chk
    check (btrim(id) <> ''),
  constraint claim_submission_audit_action_chk
    check (action in ('claim_submission_recorded', 'claim_submission_acknowledged')),
  constraint claim_submission_audit_actor_chk
    check (btrim(actor_user_id) <> ''),
  constraint claim_submission_audit_claim_fk
    foreign key (claim_id)
    references public.claimant_onboarding(claim_id)
    on update restrict
    on delete restrict,
  constraint claim_submission_audit_submission_fk
    foreign key (submission_id)
    references public.claim_submissions(id)
    on update restrict
    on delete restrict
);

create index claim_submissions_filing_package_idx
  on public.claim_submissions(filing_package_id);

create index claim_submissions_status_idx
  on public.claim_submissions(status);

create index claim_submissions_submitted_at_idx
  on public.claim_submissions(submitted_at desc);

create index claim_submission_audit_claim_occurred_idx
  on public.claim_submission_audit(claim_id, occurred_at desc);

create index claim_submission_audit_submission_occurred_idx
  on public.claim_submission_audit(submission_id, occurred_at desc);

create or replace function public.guard_claim_submission_insert()
returns trigger
language plpgsql
set search_path to 'pg_catalog'
as $function$
declare
  v_package public.claim_filing_packages%rowtype;
  v_representative_may_file text;
begin
  select *
    into v_package
    from public.claim_filing_packages
   where id = new.filing_package_id;

  if not found then
    raise exception 'filing package not found for claim submission'
      using errcode = '23503';
  end if;

  if v_package.status <> 'pre_filing_approved' then
    raise exception 'claim submission requires a pre-filing-approved package'
      using errcode = '42501';
  end if;

  if v_package.claim_id is distinct from new.claim_id
     or v_package.claim_reference is distinct from new.claim_reference
     or v_package.version is distinct from new.filing_package_version then
    raise exception 'claim submission does not match filing-package provenance'
      using errcode = '42501';
  end if;

  if v_package.pre_filing_approved_at is null
     or new.submitted_at < v_package.pre_filing_approved_at then
    raise exception 'claim submission cannot precede pre-filing approval'
      using errcode = '42501';
  end if;

  v_representative_may_file := v_package.snapshot ->> 'representativeMayFile';

  if v_representative_may_file = 'no' then
    if new.route_mode <> 'claimant_controlled'
       or new.filing_party <> 'claimant' then
      raise exception 'claimant-controlled filing package cannot record DueQuity or another representative as filer'
        using errcode = '42501';
    end if;
  elsif v_representative_may_file = 'yes' then
    if new.route_mode <> 'representative_controlled'
       or new.filing_party <> 'authorized_representative' then
      raise exception 'representative-controlled filing package requires authorized representative filing provenance'
        using errcode = '42501';
    end if;
  else
    raise exception 'filing-party determination is unresolved in the approved package'
      using errcode = '42501';
  end if;

  return new;
end;
$function$;

create trigger claim_submissions_insert_guard
before insert on public.claim_submissions
for each row
execute function public.guard_claim_submission_insert();

create or replace function public.guard_claim_submission_update()
returns trigger
language plpgsql
set search_path to 'pg_catalog'
as $function$
begin
  if new.id is distinct from old.id
     or new.claim_id is distinct from old.claim_id
     or new.claim_reference is distinct from old.claim_reference
     or new.filing_package_id is distinct from old.filing_package_id
     or new.filing_package_version is distinct from old.filing_package_version
     or new.route_mode is distinct from old.route_mode
     or new.filing_party is distinct from old.filing_party
     or new.authority_name is distinct from old.authority_name
     or new.custodian is distinct from old.custodian
     or new.submission_method is distinct from old.submission_method
     or new.submitted_at is distinct from old.submitted_at
     or new.recorded_by_user_id is distinct from old.recorded_by_user_id
     or new.external_reference is distinct from old.external_reference
     or new.submission_note is distinct from old.submission_note
     or new.created_at is distinct from old.created_at then
    raise exception 'claim submission provenance and original submission facts are immutable'
      using errcode = '42501';
  end if;

  if old.status = 'submitted'
     and new.status not in ('submitted', 'acknowledged') then
    raise exception 'invalid claim submission transition from submitted'
      using errcode = '42501';
  end if;

  if old.status = 'acknowledged'
     and new.status is distinct from old.status then
    raise exception 'acknowledged claim submission state is terminal'
      using errcode = '42501';
  end if;

  if new.status = 'submitted' then
    if new.acknowledged_at is not null
       or new.acknowledgment_recorded_by_user_id is not null
       or new.acknowledgment_reference is not null
       or new.acknowledgment_summary is not null then
      raise exception 'authority acknowledgment fields require acknowledged status'
        using errcode = '42501';
    end if;
  end if;

  if new.status = 'acknowledged' then
    if new.acknowledged_at is null
       or new.acknowledgment_recorded_by_user_id is null
       or btrim(new.acknowledgment_recorded_by_user_id) = ''
       or new.acknowledged_at < new.submitted_at then
      raise exception 'authority acknowledgment requires valid chronology and recorder provenance'
        using errcode = '42501';
    end if;
  end if;

  new.row_version := old.row_version + 1;
  new.updated_at := pg_catalog.clock_timestamp();

  return new;
end;
$function$;

create trigger claim_submissions_update_guard
before update on public.claim_submissions
for each row
execute function public.guard_claim_submission_update();

create or replace function public.reject_claim_submission_audit_mutation()
returns trigger
language plpgsql
set search_path to 'pg_catalog'
as $function$
begin
  raise exception 'claim submission audit is append-only'
    using errcode = '42501';
end;
$function$;

create trigger claim_submission_audit_update_reject
before update on public.claim_submission_audit
for each row
execute function public.reject_claim_submission_audit_mutation();

create trigger claim_submission_audit_delete_reject
before delete on public.claim_submission_audit
for each row
execute function public.reject_claim_submission_audit_mutation();

alter table public.claim_submissions enable row level security;
alter table public.claim_submission_audit enable row level security;

revoke all on table public.claim_submissions from public, anon, authenticated;
revoke all on table public.claim_submission_audit from public, anon, authenticated;

revoke all on table public.claim_submissions from service_role;
revoke all on table public.claim_submission_audit from service_role;

grant select, insert, update on table public.claim_submissions to service_role;
grant select, insert on table public.claim_submission_audit to service_role;

revoke all on function public.guard_claim_submission_insert() from public, anon, authenticated, service_role;
revoke all on function public.guard_claim_submission_update() from public, anon, authenticated, service_role;
revoke all on function public.reject_claim_submission_audit_mutation() from public, anon, authenticated, service_role;;
