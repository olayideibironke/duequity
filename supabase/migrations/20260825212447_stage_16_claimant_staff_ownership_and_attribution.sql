begin;

alter table public.claimant_onboarding
  add column originating_staff_user_id uuid,
  add column assigned_staff_user_id uuid;

update public.claimant_onboarding as co
set
  originating_staff_user_id = su.id,
  assigned_staff_user_id = su.id
from public.staff_users as su
where su.id::text = btrim(co.created_by_user_id);

do $$
begin
  if exists (
    select 1
    from public.claimant_onboarding
    where originating_staff_user_id is null
       or assigned_staff_user_id is null
  ) then
    raise exception 'stage 16 backfill failed: every claimant onboarding row must resolve to an existing staff_users record through created_by_user_id';
  end if;
end;
$$;

alter table public.claimant_onboarding
  alter column originating_staff_user_id set not null,
  alter column assigned_staff_user_id set not null;

alter table public.claimant_onboarding
  add constraint claimant_onboarding_originating_staff_user_id_fkey
    foreign key (originating_staff_user_id)
    references public.staff_users(id)
    on update restrict
    on delete restrict,
  add constraint claimant_onboarding_assigned_staff_user_id_fkey
    foreign key (assigned_staff_user_id)
    references public.staff_users(id)
    on update restrict
    on delete restrict;

create index claimant_onboarding_originating_staff_user_id_idx
  on public.claimant_onboarding(originating_staff_user_id);

create index claimant_onboarding_assigned_staff_user_id_idx
  on public.claimant_onboarding(assigned_staff_user_id);

comment on column public.claimant_onboarding.originating_staff_user_id is
  'Permanent business attribution for the DueQuity staff member who brought the claimant into controlled claimant onboarding. Immutable after insert.';

comment on column public.claimant_onboarding.assigned_staff_user_id is
  'Current DueQuity staff manager for the claimant. Staff-facing application access is scoped by this assignment, while super_admin retains full access.';

create or replace function public.guard_claimant_onboarding_update()
returns trigger
language plpgsql
set search_path to 'pg_catalog'
as $function$
begin
  if new.claim_id is distinct from old.claim_id
     or new.claim_reference is distinct from old.claim_reference
     or new.conversion_id is distinct from old.conversion_id
     or new.claimant_id is distinct from old.claimant_id
     or new.claimant_reference is distinct from old.claimant_reference
     or new.participant_id is distinct from old.participant_id
     or new.created_at is distinct from old.created_at
     or new.created_by_user_id is distinct from old.created_by_user_id
     or new.originating_staff_user_id is distinct from old.originating_staff_user_id then
    raise exception 'claimant onboarding identity/provenance is immutable' using errcode='42501';
  end if;

  if old.service_agreement_signed_at is not null and (
       new.service_agreement_signed_at is distinct from old.service_agreement_signed_at or
       new.service_agreement_signed_by_claimant_id is distinct from old.service_agreement_signed_by_claimant_id or
       new.service_agreement_required_disclosure_keys_snapshot is distinct from old.service_agreement_required_disclosure_keys_snapshot or
       new.service_agreement_cancellation_deadline is distinct from old.service_agreement_cancellation_deadline or
       new.service_agreement_document_id is distinct from old.service_agreement_document_id or
       new.service_agreement_recorded_by_user_id is distinct from old.service_agreement_recorded_by_user_id or
       new.service_agreement_recorded_at is distinct from old.service_agreement_recorded_at or
       new.fee_agreement_id is distinct from old.fee_agreement_id or
       new.fee_agreement_legal_rule_version_snapshot is distinct from old.fee_agreement_legal_rule_version_snapshot or
       new.legal_rule_version_snapshot is distinct from old.legal_rule_version_snapshot or
       new.jurisdiction_package_id is distinct from old.jurisdiction_package_id or
       new.jurisdiction_package_version is distinct from old.jurisdiction_package_version or
       new.commercial_quote_id is distinct from old.commercial_quote_id or
       new.commercial_snapshot_hash is distinct from old.commercial_snapshot_hash or
       new.commercial_policy_id is distinct from old.commercial_policy_id or
       new.commercial_policy_version is distinct from old.commercial_policy_version
     ) then
    raise exception 'signed service-agreement provenance is immutable' using errcode='42501';
  end if;

  new.row_version := old.row_version + 1;
  new.updated_at := pg_catalog.clock_timestamp();

  return new;
end;
$function$;

commit;;
