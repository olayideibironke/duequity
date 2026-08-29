create table public.claimant_onboarding (
  claim_id text primary key check (btrim(claim_id)<>''),
  claim_reference text not null unique check (btrim(claim_reference)<>''),
  conversion_id text not null unique references public.opportunity_conversions(id) on update restrict on delete restrict,
  claimant_id text not null unique check (btrim(claimant_id)<>''),
  claimant_reference text not null unique check (btrim(claimant_reference)<>''),
  claimant_auth_user_id uuid,
  participant_id text not null unique check (btrim(participant_id)<>''),
  legal_name text not null check (btrim(legal_name)<>''),
  preferred_name text,
  date_of_birth date,
  entity_type text not null check (entity_type in ('individual','estate','trust','business')),
  email text not null check (btrim(email)<>'' and position('@' in email)>1),
  mobile_phone text not null check (mobile_phone ~ '^[0-9]{10}$'),
  contact_methods jsonb not null check (jsonb_typeof(contact_methods)='array'),
  mailing_address jsonb,
  preferred_contact_channel text not null check (preferred_contact_channel in ('email','phone_call','sms','mail')),
  consent_recorded_at date,
  consent_source text,
  identity_verification text not null default 'not_started' check (identity_verification in ('not_started','documents_requested','under_review','verified','failed','manual_review')),
  identity_verified_at date,
  identity_provider_ref text,
  preferred_language text not null default 'en' check (btrim(preferred_language)<>''),
  accessibility_note text,
  fraud_flags jsonb not null default '[]'::jsonb check (jsonb_typeof(fraud_flags)='array'),
  claimant_created_on date not null,
  claimant_notes jsonb not null default '[]'::jsonb check (jsonb_typeof(claimant_notes)='array'),
  participant_role text not null check (participant_role in ('primary_claimant','co_claimant','heir','personal_representative','trustee','authorised_contact','competing_claimant')),
  relationship text not null check (relationship in ('self_former_owner','surviving_spouse','child','grandchild','sibling','parent','executor','administrator','trustee','heir_at_law','business_owner','other')),
  asserted_share numeric(9,8) check (asserted_share is null or asserted_share between 0 and 1),
  determined_share numeric(9,8) check (determined_share is null or determined_share between 0 and 1),
  contesting boolean,
  participant_added_on date not null,
  disclosure_acknowledgements jsonb not null default '[]'::jsonb check (jsonb_typeof(disclosure_acknowledgements)='array'),
  free_claim_option_disclosed_at date,
  jurisdiction_package_id text not null,
  jurisdiction_package_version bigint not null check (jurisdiction_package_version>=1),
  legal_rule_version_snapshot bigint not null check (legal_rule_version_snapshot>=1),
  commercial_quote_id text not null references public.commercial_fee_quotes(quote_id) on update restrict on delete restrict,
  commercial_snapshot_hash text not null check (commercial_snapshot_hash ~ '^[0-9a-f]{64}$'),
  commercial_policy_id text not null,
  commercial_policy_version bigint not null check (commercial_policy_version>=1),
  fee_agreement_id text not null check (btrim(fee_agreement_id)<>''),
  fee_agreement_legal_rule_version_snapshot bigint check (fee_agreement_legal_rule_version_snapshot is null or fee_agreement_legal_rule_version_snapshot>=1),
  service_agreement_signed_at date,
  service_agreement_signed_by_claimant_id text,
  service_agreement_required_disclosure_keys_snapshot text[],
  service_agreement_cancellation_deadline date,
  service_agreement_document_id text,
  service_agreement_recorded_by_user_id text,
  service_agreement_recorded_at timestamptz,
  created_by_user_id text not null check (btrim(created_by_user_id)<>''),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  row_version bigint not null default 1 check (row_version>=1),
  foreign key (claim_id) references public.opportunity_conversions(claim_id) on update restrict on delete restrict,
  foreign key (jurisdiction_package_id,jurisdiction_package_version) references public.jurisdiction_rule_packages(package_id,version) on update restrict on delete restrict,
  foreign key (commercial_policy_id,commercial_policy_version) references public.commercial_fee_policies(id,version) on update restrict on delete restrict,
  check ((identity_verification='verified' and identity_verified_at is not null) or identity_verification<>'verified'),
  check ((service_agreement_signed_at is null and service_agreement_signed_by_claimant_id is null and service_agreement_required_disclosure_keys_snapshot is null and service_agreement_recorded_by_user_id is null and service_agreement_recorded_at is null) or
         (service_agreement_signed_at is not null and service_agreement_signed_by_claimant_id=claimant_id and service_agreement_required_disclosure_keys_snapshot is not null and cardinality(service_agreement_required_disclosure_keys_snapshot)>0 and service_agreement_recorded_by_user_id is not null and service_agreement_recorded_at is not null and identity_verification='verified' and identity_verified_at is not null and free_claim_option_disclosed_at is not null and fee_agreement_legal_rule_version_snapshot=legal_rule_version_snapshot)),
  check (service_agreement_cancellation_deadline is null or service_agreement_signed_at is not null),
  check (service_agreement_cancellation_deadline is null or service_agreement_cancellation_deadline>=service_agreement_signed_at)
);
comment on table public.claimant_onboarding is 'DueQuity claimant onboarding state for a persistently converted claim. No SSN, government identifier, or identity-document image belongs here; identity provider references are opaque. Agreement provenance is immutable once signed.';

create index claimant_onboarding_conversion_fk_idx on public.claimant_onboarding(conversion_id);
create index claimant_onboarding_package_fk_idx on public.claimant_onboarding(jurisdiction_package_id,jurisdiction_package_version);
create index claimant_onboarding_quote_fk_idx on public.claimant_onboarding(commercial_quote_id);
create index claimant_onboarding_policy_fk_idx on public.claimant_onboarding(commercial_policy_id,commercial_policy_version);
create index claimant_onboarding_auth_user_idx on public.claimant_onboarding(claimant_auth_user_id) where claimant_auth_user_id is not null;

create table public.claimant_onboarding_audit (
  id text primary key check (btrim(id)<>''),
  claim_id text not null references public.claimant_onboarding(claim_id) on update restrict on delete restrict,
  claimant_id text not null check (btrim(claimant_id)<>''),
  action text not null check (action in ('onboarding_started','contact_updated','contact_verified','contact_consent_recorded','identity_status_changed','disclosures_acknowledged','service_agreement_signed')),
  actor_user_id text not null check (btrim(actor_user_id)<>''),
  occurred_at timestamptz not null,
  detail text
);
comment on table public.claimant_onboarding_audit is 'Append-only claimant onboarding audit. Material onboarding actions also feed public.audit_events from the authorized server transaction.';
create index claimant_onboarding_audit_claim_idx on public.claimant_onboarding_audit(claim_id,occurred_at desc);

create or replace function public.guard_claimant_onboarding_update()
returns trigger language plpgsql set search_path=pg_catalog as $$
begin
  if new.claim_id is distinct from old.claim_id or new.claim_reference is distinct from old.claim_reference or new.conversion_id is distinct from old.conversion_id or new.claimant_id is distinct from old.claimant_id or new.claimant_reference is distinct from old.claimant_reference or new.participant_id is distinct from old.participant_id or new.created_at is distinct from old.created_at or new.created_by_user_id is distinct from old.created_by_user_id then
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
  new.row_version:=old.row_version+1;
  new.updated_at:=pg_catalog.clock_timestamp();
  return new;
end;$$;

create or replace function public.reject_claimant_onboarding_audit_mutation()
returns trigger language plpgsql set search_path=pg_catalog as $$ begin raise exception 'claimant onboarding audit is append-only' using errcode='42501'; end; $$;

create trigger claimant_onboarding_guard_update before update on public.claimant_onboarding for each row execute function public.guard_claimant_onboarding_update();
create trigger claimant_onboarding_audit_reject_update_delete before update or delete on public.claimant_onboarding_audit for each row execute function public.reject_claimant_onboarding_audit_mutation();
create trigger claimant_onboarding_audit_reject_truncate before truncate on public.claimant_onboarding_audit for each statement execute function public.reject_claimant_onboarding_audit_mutation();

alter table public.claimant_onboarding enable row level security;
alter table public.claimant_onboarding_audit enable row level security;
revoke all privileges on table public.claimant_onboarding,public.claimant_onboarding_audit from public,anon,authenticated;
revoke all privileges on table public.claimant_onboarding from service_role;
grant select,insert,update on table public.claimant_onboarding to service_role;
revoke delete,truncate on table public.claimant_onboarding from service_role;
revoke all privileges on table public.claimant_onboarding_audit from service_role;
grant select,insert on table public.claimant_onboarding_audit to service_role;
revoke update,delete,truncate on table public.claimant_onboarding_audit from service_role;
revoke execute on function public.guard_claimant_onboarding_update() from public,anon,authenticated,service_role;
revoke execute on function public.reject_claimant_onboarding_audit_mutation() from public,anon,authenticated,service_role;;
