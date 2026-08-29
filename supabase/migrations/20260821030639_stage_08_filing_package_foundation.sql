create table public.claim_filing_packages (
  id text primary key check (btrim(id)<>''),
  claim_id text not null references public.claimant_onboarding(claim_id) on update restrict on delete restrict,
  claim_reference text not null check (btrim(claim_reference)<>''),
  version bigint not null check (version>=1),
  status text not null check (status in ('prepared','under_review','pre_filing_approved','returned_for_changes','superseded')),
  snapshot jsonb not null check (jsonb_typeof(snapshot)='object'),
  package_hash text not null check (package_hash ~ '^[0-9a-f]{64}$'),
  jurisdiction_package_id text not null,
  jurisdiction_package_version bigint not null check (jurisdiction_package_version>=1),
  jurisdiction_legal_rule_version bigint not null check (jurisdiction_legal_rule_version>=1),
  commercial_quote_id text not null references public.commercial_fee_quotes(quote_id) on update restrict on delete restrict,
  commercial_snapshot_hash text not null check (commercial_snapshot_hash ~ '^[0-9a-f]{64}$'),
  commercial_policy_id text not null,
  commercial_policy_version bigint not null check (commercial_policy_version>=1),
  fee_agreement_id text not null check (btrim(fee_agreement_id)<>''),
  fee_agreement_legal_rule_version_snapshot bigint not null check (fee_agreement_legal_rule_version_snapshot>=1),
  fee_agreement_document_id text not null references public.claim_documents(id) on update restrict on delete restrict,
  accepted_documents_snapshot jsonb not null check (jsonb_typeof(accepted_documents_snapshot)='array'),
  readiness_snapshot jsonb not null check (jsonb_typeof(readiness_snapshot)='array'),
  readiness_completed_count integer not null check (readiness_completed_count>=0),
  readiness_total_count integer not null check (readiness_total_count>=0 and readiness_completed_count<=readiness_total_count),
  prepared_by_user_id text not null check (btrim(prepared_by_user_id)<>''),
  prepared_at timestamptz not null,
  submitted_for_review_by_user_id text,
  submitted_for_review_at timestamptz,
  reviewed_by_user_id text,
  reviewed_at timestamptz,
  review_note text,
  pre_filing_approved_at timestamptz,
  returned_at timestamptz,
  return_reason text,
  superseded_at timestamptz,
  superseded_by_package_id text,
  row_version bigint not null default 1 check (row_version>=1),
  updated_at timestamptz not null default now(),
  unique (claim_id,version),
  foreign key (jurisdiction_package_id,jurisdiction_package_version) references public.jurisdiction_rule_packages(package_id,version) on update restrict on delete restrict,
  foreign key (commercial_policy_id,commercial_policy_version) references public.commercial_fee_policies(id,version) on update restrict on delete restrict,
  foreign key (superseded_by_package_id) references public.claim_filing_packages(id) on update restrict on delete restrict,
  check ((status='under_review' and submitted_for_review_by_user_id is not null and submitted_for_review_at is not null) or status<>'under_review'),
  check ((status='pre_filing_approved' and reviewed_by_user_id is not null and reviewed_at is not null and pre_filing_approved_at is not null and reviewed_by_user_id<>prepared_by_user_id) or status<>'pre_filing_approved'),
  check ((status='returned_for_changes' and reviewed_by_user_id is not null and reviewed_at is not null and returned_at is not null and return_reason is not null and btrim(return_reason)<>'' and reviewed_by_user_id<>prepared_by_user_id) or status<>'returned_for_changes'),
  check ((status='superseded' and superseded_at is not null and superseded_by_package_id is not null) or status<>'superseded')
);
comment on table public.claim_filing_packages is 'Frozen internal DueQuity filing-package snapshots. package_hash and version snapshots are migration/application literals and are never recomputed by the database. Pre-filing approval does not submit anything to a court, agency, or custodian.';

create index claim_filing_packages_claim_status_idx on public.claim_filing_packages(claim_id,status,version desc);
create index claim_filing_packages_jurisdiction_fk_idx on public.claim_filing_packages(jurisdiction_package_id,jurisdiction_package_version);
create index claim_filing_packages_quote_fk_idx on public.claim_filing_packages(commercial_quote_id);
create index claim_filing_packages_policy_fk_idx on public.claim_filing_packages(commercial_policy_id,commercial_policy_version);
create index claim_filing_packages_fee_document_fk_idx on public.claim_filing_packages(fee_agreement_document_id);
create index claim_filing_packages_superseded_fk_idx on public.claim_filing_packages(superseded_by_package_id) where superseded_by_package_id is not null;

create table public.claim_filing_package_audit (
  id text primary key check (btrim(id)<>''),
  claim_id text not null references public.claimant_onboarding(claim_id) on update restrict on delete restrict,
  package_id text not null references public.claim_filing_packages(id) on update restrict on delete restrict,
  action text not null check (action in ('filing_package_prepared','filing_package_submitted_for_review','filing_package_pre_filing_approved','filing_package_returned','filing_package_superseded')),
  actor_user_id text not null check (btrim(actor_user_id)<>''),
  occurred_at timestamptz not null,
  detail text
);
comment on table public.claim_filing_package_audit is 'Append-only internal filing-package lifecycle audit. Material actions also feed public.audit_events in the authorized server transaction.';
create index claim_filing_package_audit_claim_idx on public.claim_filing_package_audit(claim_id,occurred_at desc);
create index claim_filing_package_audit_package_idx on public.claim_filing_package_audit(package_id,occurred_at desc);

create or replace function public.guard_claim_filing_package_update()
returns trigger language plpgsql set search_path=pg_catalog as $$
begin
  if new.id is distinct from old.id or new.claim_id is distinct from old.claim_id or new.claim_reference is distinct from old.claim_reference or new.version is distinct from old.version or new.snapshot is distinct from old.snapshot or new.package_hash is distinct from old.package_hash or new.jurisdiction_package_id is distinct from old.jurisdiction_package_id or new.jurisdiction_package_version is distinct from old.jurisdiction_package_version or new.jurisdiction_legal_rule_version is distinct from old.jurisdiction_legal_rule_version or new.commercial_quote_id is distinct from old.commercial_quote_id or new.commercial_snapshot_hash is distinct from old.commercial_snapshot_hash or new.commercial_policy_id is distinct from old.commercial_policy_id or new.commercial_policy_version is distinct from old.commercial_policy_version or new.fee_agreement_id is distinct from old.fee_agreement_id or new.fee_agreement_legal_rule_version_snapshot is distinct from old.fee_agreement_legal_rule_version_snapshot or new.fee_agreement_document_id is distinct from old.fee_agreement_document_id or new.accepted_documents_snapshot is distinct from old.accepted_documents_snapshot or new.readiness_snapshot is distinct from old.readiness_snapshot or new.readiness_completed_count is distinct from old.readiness_completed_count or new.readiness_total_count is distinct from old.readiness_total_count or new.prepared_by_user_id is distinct from old.prepared_by_user_id or new.prepared_at is distinct from old.prepared_at then
    raise exception 'filing package snapshot, hash, versions, documents, and preparation provenance are immutable' using errcode='42501';
  end if;
  if old.status='prepared' and new.status not in ('prepared','under_review') then raise exception 'invalid filing package transition from prepared' using errcode='42501'; end if;
  if old.status='under_review' and new.status not in ('under_review','pre_filing_approved','returned_for_changes') then raise exception 'invalid filing package transition from under_review' using errcode='42501'; end if;
  if old.status='returned_for_changes' and new.status not in ('returned_for_changes','superseded') then raise exception 'returned filing package must be superseded by a new version' using errcode='42501'; end if;
  if old.status in ('pre_filing_approved','superseded') and new.status is distinct from old.status then raise exception 'approved or superseded filing package state is terminal' using errcode='42501'; end if;
  if new.status in ('pre_filing_approved','returned_for_changes') and (new.reviewed_by_user_id is null or new.reviewed_by_user_id=new.prepared_by_user_id) then raise exception 'filing package requires an independent reviewer' using errcode='42501'; end if;
  new.row_version:=old.row_version+1;
  new.updated_at:=pg_catalog.clock_timestamp();
  return new;
end;$$;

create or replace function public.reject_claim_filing_package_audit_mutation()
returns trigger language plpgsql set search_path=pg_catalog as $$ begin raise exception 'claim filing package audit is append-only' using errcode='42501'; end; $$;

create trigger claim_filing_packages_guard_update before update on public.claim_filing_packages for each row execute function public.guard_claim_filing_package_update();
create trigger claim_filing_package_audit_reject_update_delete before update or delete on public.claim_filing_package_audit for each row execute function public.reject_claim_filing_package_audit_mutation();
create trigger claim_filing_package_audit_reject_truncate before truncate on public.claim_filing_package_audit for each statement execute function public.reject_claim_filing_package_audit_mutation();

alter table public.claim_filing_packages enable row level security;
alter table public.claim_filing_package_audit enable row level security;
revoke all privileges on table public.claim_filing_packages,public.claim_filing_package_audit from public,anon,authenticated;
revoke all privileges on table public.claim_filing_packages from service_role;
grant select,insert,update on table public.claim_filing_packages to service_role;
revoke delete,truncate on table public.claim_filing_packages from service_role;
revoke all privileges on table public.claim_filing_package_audit from service_role;
grant select,insert on table public.claim_filing_package_audit to service_role;
revoke update,delete,truncate on table public.claim_filing_package_audit from service_role;
revoke execute on function public.guard_claim_filing_package_update() from public,anon,authenticated,service_role;
revoke execute on function public.reject_claim_filing_package_audit_mutation() from public,anon,authenticated,service_role;;
