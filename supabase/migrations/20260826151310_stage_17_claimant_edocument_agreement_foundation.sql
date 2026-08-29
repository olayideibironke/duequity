create table public.claimant_agreement_templates (
  id uuid primary key default gen_random_uuid(),
  template_key text not null,
  version bigint not null check (version >= 1),
  title text not null check (btrim(title) <> ''),
  status text not null default 'draft' check (status in ('draft','approved','retired')),
  body_markdown text not null check (btrim(body_markdown) <> ''),
  electronic_consent_text text not null check (btrim(electronic_consent_text) <> ''),
  signature_intent_text text not null check (btrim(signature_intent_text) <> ''),
  required_acknowledgement_keys text[] not null check (cardinality(required_acknowledgement_keys) > 0),
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  created_by_staff_user_id uuid not null references public.staff_users(id) on update restrict on delete restrict,
  approved_by_staff_user_id uuid references public.staff_users(id) on update restrict on delete restrict,
  approved_at timestamptz,
  retired_at timestamptz,
  row_version bigint not null default 1 check (row_version >= 1),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (template_key, version),
  check (
    (status = 'draft' and approved_by_staff_user_id is null and approved_at is null and retired_at is null)
    or
    (status = 'approved' and approved_by_staff_user_id is not null and approved_at is not null and retired_at is null)
    or
    (status = 'retired' and approved_by_staff_user_id is not null and approved_at is not null and retired_at is not null)
  )
);

create table public.claimant_agreement_envelopes (
  id uuid primary key default gen_random_uuid(),
  claim_id text not null references public.claimant_onboarding(claim_id) on update restrict on delete restrict,
  claim_reference text not null check (btrim(claim_reference) <> ''),
  claimant_id text not null references public.claimant_onboarding(claimant_id) on update restrict on delete restrict,
  claimant_reference text not null check (btrim(claimant_reference) <> ''),
  claimant_auth_user_id uuid not null references auth.users(id) on update cascade on delete restrict,
  template_id uuid not null references public.claimant_agreement_templates(id) on update restrict on delete restrict,
  template_key text not null check (btrim(template_key) <> ''),
  template_version bigint not null check (template_version >= 1),
  template_content_hash text not null check (template_content_hash ~ '^[0-9a-f]{64}$'),
  agreement_title text not null check (btrim(agreement_title) <> ''),
  status text not null default 'draft' check (status in ('draft','issued','opened','consented','signed','submitted','voided','superseded')),
  recovery_basis text not null check (recovery_basis in ('estimated','confirmed')),
  recovery_amount_cents bigint not null check (recovery_amount_cents >= 0),
  fee_model text not null check (fee_model in ('percentage','flat','capped_success')),
  selected_percentage numeric,
  selected_flat_amount_cents bigint,
  projected_fee_cents bigint not null check (projected_fee_cents >= 0),
  projected_claimant_net_cents bigint not null check (projected_claimant_net_cents >= 0),
  commercial_quote_id text not null references public.commercial_fee_quotes(quote_id) on update restrict on delete restrict,
  commercial_snapshot_hash text not null check (commercial_snapshot_hash ~ '^[0-9a-f]{64}$'),
  commercial_policy_id text not null check (btrim(commercial_policy_id) <> ''),
  commercial_policy_version bigint not null check (commercial_policy_version >= 1),
  jurisdiction_package_id text not null,
  jurisdiction_package_version bigint not null check (jurisdiction_package_version >= 1),
  jurisdiction_legal_rule_version bigint not null check (jurisdiction_legal_rule_version >= 1),
  payment_route text not null check (btrim(payment_route) <> ''),
  payment_launch_track text not null check (btrim(payment_launch_track) <> ''),
  claimant_rights_snapshot jsonb not null check (jsonb_typeof(claimant_rights_snapshot) = 'object'),
  required_acknowledgement_keys text[] not null check (cardinality(required_acknowledgement_keys) > 0),
  agreement_snapshot jsonb not null check (jsonb_typeof(agreement_snapshot) = 'object'),
  agreement_hash text not null check (agreement_hash ~ '^[0-9a-f]{64}$'),
  created_by_staff_user_id uuid not null references public.staff_users(id) on update restrict on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  issued_by_staff_user_id uuid references public.staff_users(id) on update restrict on delete restrict,
  issued_at timestamptz,
  opened_at timestamptz,
  electronic_consent_at timestamptz,
  electronic_consent_text_snapshot text,
  acknowledged_keys_snapshot text[],
  signature_method text check (signature_method in ('drawn_and_typed')),
  signed_by_claimant_auth_user_id uuid references auth.users(id) on update cascade on delete restrict,
  signed_by_claimant_id text references public.claimant_onboarding(claimant_id) on update restrict on delete restrict,
  signed_legal_name text,
  signature_sha256 text check (signature_sha256 is null or signature_sha256 ~ '^[0-9a-f]{64}$'),
  signed_at timestamptz,
  submitted_at timestamptz,
  final_document_id text references public.claim_documents(id) on update restrict on delete restrict,
  final_document_sha256 text check (final_document_sha256 is null or final_document_sha256 ~ '^[0-9a-f]{64}$'),
  signature_certificate_snapshot jsonb check (signature_certificate_snapshot is null or jsonb_typeof(signature_certificate_snapshot) = 'object'),
  supersedes_envelope_id uuid references public.claimant_agreement_envelopes(id) on update restrict on delete restrict,
  void_reason text,
  row_version bigint not null default 1 check (row_version >= 1),
  updated_at timestamptz not null default clock_timestamp(),
  check ((selected_percentage is null) or (selected_percentage >= 0 and selected_percentage <= 1)),
  check ((selected_flat_amount_cents is null) or selected_flat_amount_cents >= 0),
  check (
    (fee_model = 'percentage' and selected_percentage is not null and selected_flat_amount_cents is null)
    or (fee_model = 'flat' and selected_percentage is null and selected_flat_amount_cents is not null)
    or (fee_model = 'capped_success' and selected_percentage is not null)
  ),
  check (projected_claimant_net_cents <= recovery_amount_cents),
  check ((issued_at is null and issued_by_staff_user_id is null) or (issued_at is not null and issued_by_staff_user_id is not null)),
  check ((signed_at is null and signed_by_claimant_auth_user_id is null and signed_by_claimant_id is null and signed_legal_name is null and signature_method is null and signature_sha256 is null)
      or (signed_at is not null and signed_by_claimant_auth_user_id is not null and signed_by_claimant_id = claimant_id and signed_legal_name is not null and btrim(signed_legal_name) <> '' and signature_method is not null and signature_sha256 is not null)),
  check ((submitted_at is null and final_document_id is null and final_document_sha256 is null and signature_certificate_snapshot is null)
      or (submitted_at is not null and final_document_id is not null and final_document_sha256 is not null and signature_certificate_snapshot is not null)),
  unique (claim_id, id)
);

create table public.claimant_agreement_events (
  id uuid primary key default gen_random_uuid(),
  envelope_id uuid not null references public.claimant_agreement_envelopes(id) on update restrict on delete restrict,
  event_type text not null check (event_type in ('created','issued','opened','electronic_consent','disclosures_acknowledged','signing_started','signed','submitted','voided','superseded')),
  actor_type text not null check (actor_type in ('staff','claimant','system')),
  actor_staff_user_id uuid references public.staff_users(id) on update restrict on delete restrict,
  actor_claimant_auth_user_id uuid references auth.users(id) on update cascade on delete restrict,
  occurred_at timestamptz not null default clock_timestamp(),
  detail jsonb not null default '{}'::jsonb check (jsonb_typeof(detail) = 'object'),
  check (
    (actor_type = 'staff' and actor_staff_user_id is not null and actor_claimant_auth_user_id is null)
    or (actor_type = 'claimant' and actor_staff_user_id is null and actor_claimant_auth_user_id is not null)
    or (actor_type = 'system' and actor_staff_user_id is null and actor_claimant_auth_user_id is null)
  )
);

create index claimant_agreement_envelopes_claim_idx on public.claimant_agreement_envelopes (claim_id, created_at desc);
create index claimant_agreement_envelopes_claimant_idx on public.claimant_agreement_envelopes (claimant_id, created_at desc);
create index claimant_agreement_envelopes_status_idx on public.claimant_agreement_envelopes (status, created_at desc);
create index claimant_agreement_events_envelope_idx on public.claimant_agreement_events (envelope_id, occurred_at asc);

create or replace function public.guard_claimant_agreement_template_update()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
begin
  if old.status = 'retired' then
    raise exception 'retired agreement template is immutable' using errcode='42501';
  end if;

  if old.status = 'approved' and (
       new.template_key is distinct from old.template_key
       or new.version is distinct from old.version
       or new.title is distinct from old.title
       or new.body_markdown is distinct from old.body_markdown
       or new.electronic_consent_text is distinct from old.electronic_consent_text
       or new.signature_intent_text is distinct from old.signature_intent_text
       or new.required_acknowledgement_keys is distinct from old.required_acknowledgement_keys
       or new.content_hash is distinct from old.content_hash
       or new.created_by_staff_user_id is distinct from old.created_by_staff_user_id
       or new.created_at is distinct from old.created_at
       or new.approved_by_staff_user_id is distinct from old.approved_by_staff_user_id
       or new.approved_at is distinct from old.approved_at
     ) then
    raise exception 'approved agreement template content and approval provenance are immutable' using errcode='42501';
  end if;

  if old.status = 'draft' and new.status not in ('draft','approved') then
    raise exception 'draft agreement template may only remain draft or become approved' using errcode='42501';
  end if;

  if old.status = 'approved' and new.status not in ('approved','retired') then
    raise exception 'approved agreement template may only remain approved or become retired' using errcode='42501';
  end if;

  new.row_version := old.row_version + 1;
  new.updated_at := pg_catalog.clock_timestamp();
  return new;
end;
$function$;

create or replace function public.reject_claimant_agreement_template_delete()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
begin
  raise exception 'agreement templates are retained for legal provenance and cannot be deleted' using errcode='42501';
end;
$function$;

create or replace function public.guard_claimant_agreement_envelope_update()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
declare
  old_rank integer;
  new_rank integer;
begin
  if old.status in ('voided','superseded') then
    raise exception 'terminal agreement envelope is immutable' using errcode='42501';
  end if;

  if new.claim_id is distinct from old.claim_id
     or new.claim_reference is distinct from old.claim_reference
     or new.claimant_id is distinct from old.claimant_id
     or new.claimant_reference is distinct from old.claimant_reference
     or new.claimant_auth_user_id is distinct from old.claimant_auth_user_id
     or new.template_id is distinct from old.template_id
     or new.template_key is distinct from old.template_key
     or new.template_version is distinct from old.template_version
     or new.template_content_hash is distinct from old.template_content_hash
     or new.agreement_title is distinct from old.agreement_title
     or new.recovery_basis is distinct from old.recovery_basis
     or new.recovery_amount_cents is distinct from old.recovery_amount_cents
     or new.fee_model is distinct from old.fee_model
     or new.selected_percentage is distinct from old.selected_percentage
     or new.selected_flat_amount_cents is distinct from old.selected_flat_amount_cents
     or new.projected_fee_cents is distinct from old.projected_fee_cents
     or new.projected_claimant_net_cents is distinct from old.projected_claimant_net_cents
     or new.commercial_quote_id is distinct from old.commercial_quote_id
     or new.commercial_snapshot_hash is distinct from old.commercial_snapshot_hash
     or new.commercial_policy_id is distinct from old.commercial_policy_id
     or new.commercial_policy_version is distinct from old.commercial_policy_version
     or new.jurisdiction_package_id is distinct from old.jurisdiction_package_id
     or new.jurisdiction_package_version is distinct from old.jurisdiction_package_version
     or new.jurisdiction_legal_rule_version is distinct from old.jurisdiction_legal_rule_version
     or new.payment_route is distinct from old.payment_route
     or new.payment_launch_track is distinct from old.payment_launch_track
     or new.claimant_rights_snapshot is distinct from old.claimant_rights_snapshot
     or new.required_acknowledgement_keys is distinct from old.required_acknowledgement_keys
     or new.agreement_snapshot is distinct from old.agreement_snapshot
     or new.agreement_hash is distinct from old.agreement_hash
     or new.created_by_staff_user_id is distinct from old.created_by_staff_user_id
     or new.created_at is distinct from old.created_at
     or new.supersedes_envelope_id is distinct from old.supersedes_envelope_id then
    raise exception 'agreement envelope identity, commercial, legal and document snapshot are immutable' using errcode='42501';
  end if;

  old_rank := case old.status
    when 'draft' then 0 when 'issued' then 1 when 'opened' then 2 when 'consented' then 3 when 'signed' then 4 when 'submitted' then 5 else 99 end;
  new_rank := case new.status
    when 'draft' then 0 when 'issued' then 1 when 'opened' then 2 when 'consented' then 3 when 'signed' then 4 when 'submitted' then 5 when 'voided' then 98 when 'superseded' then 99 else 100 end;

  if new.status not in ('voided','superseded') and new_rank < old_rank then
    raise exception 'agreement envelope lifecycle cannot move backward' using errcode='42501';
  end if;

  if old.signed_at is not null and (
       new.signed_at is distinct from old.signed_at
       or new.signed_by_claimant_auth_user_id is distinct from old.signed_by_claimant_auth_user_id
       or new.signed_by_claimant_id is distinct from old.signed_by_claimant_id
       or new.signed_legal_name is distinct from old.signed_legal_name
       or new.signature_method is distinct from old.signature_method
       or new.signature_sha256 is distinct from old.signature_sha256
       or new.electronic_consent_at is distinct from old.electronic_consent_at
       or new.electronic_consent_text_snapshot is distinct from old.electronic_consent_text_snapshot
       or new.acknowledged_keys_snapshot is distinct from old.acknowledged_keys_snapshot
     ) then
    raise exception 'executed claimant signature evidence is immutable' using errcode='42501';
  end if;

  if old.submitted_at is not null and (
       new.submitted_at is distinct from old.submitted_at
       or new.final_document_id is distinct from old.final_document_id
       or new.final_document_sha256 is distinct from old.final_document_sha256
       or new.signature_certificate_snapshot is distinct from old.signature_certificate_snapshot
     ) then
    raise exception 'submitted agreement document evidence is immutable' using errcode='42501';
  end if;

  if new.status in ('issued','opened','consented','signed','submitted') and (new.issued_at is null or new.issued_by_staff_user_id is null) then
    raise exception 'issued agreement lifecycle requires staff issuance provenance' using errcode='42501';
  end if;

  if new.status in ('consented','signed','submitted') then
    if new.electronic_consent_at is null or new.electronic_consent_text_snapshot is null or btrim(new.electronic_consent_text_snapshot) = '' then
      raise exception 'electronic consent evidence is required before signing' using errcode='42501';
    end if;
    if new.acknowledged_keys_snapshot is null or not (new.acknowledged_keys_snapshot @> new.required_acknowledgement_keys) then
      raise exception 'all required agreement acknowledgements must be recorded before signing' using errcode='42501';
    end if;
  end if;

  if new.status in ('signed','submitted') and (
       new.signed_at is null
       or new.signed_by_claimant_auth_user_id is null
       or new.signed_by_claimant_id is distinct from new.claimant_id
       or new.signed_legal_name is null
       or btrim(new.signed_legal_name) = ''
       or new.signature_method is null
       or new.signature_sha256 is null
     ) then
    raise exception 'complete claimant signature evidence is required for signed agreement status' using errcode='42501';
  end if;

  if new.status = 'submitted' and (
       new.submitted_at is null
       or new.final_document_id is null
       or new.final_document_sha256 is null
       or new.signature_certificate_snapshot is null
     ) then
    raise exception 'submitted agreement requires final PDF and signature certificate evidence' using errcode='42501';
  end if;

  new.row_version := old.row_version + 1;
  new.updated_at := pg_catalog.clock_timestamp();
  return new;
end;
$function$;

create or replace function public.guard_claimant_agreement_final_document()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
declare
  v_doc public.claim_documents%rowtype;
begin
  if new.final_document_id is not null and (old.final_document_id is null or new.final_document_id is distinct from old.final_document_id) then
    select * into v_doc from public.claim_documents where id = new.final_document_id;
    if not found
       or v_doc.claim_id <> new.claim_id
       or v_doc.claimant_id <> new.claimant_id
       or v_doc.kind <> 'fee_agreement'
       or v_doc.status <> 'accepted'
       or v_doc.malware_scan_status <> 'clean' then
      raise exception 'final agreement must be a clean accepted fee_agreement document for this claimant and claim' using errcode='42501';
    end if;
  end if;
  return new;
end;
$function$;

create or replace function public.reject_claimant_agreement_envelope_delete()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
begin
  raise exception 'agreement envelopes are retained for legal provenance and cannot be deleted' using errcode='42501';
end;
$function$;

create or replace function public.reject_claimant_agreement_event_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
begin
  raise exception 'agreement events are append-only and cannot be updated, deleted or truncated' using errcode='42501';
end;
$function$;

create trigger claimant_agreement_templates_guard_update
before update on public.claimant_agreement_templates
for each row execute function public.guard_claimant_agreement_template_update();

create trigger claimant_agreement_templates_reject_delete
before delete on public.claimant_agreement_templates
for each row execute function public.reject_claimant_agreement_template_delete();

create trigger claimant_agreement_envelopes_guard_update
before update on public.claimant_agreement_envelopes
for each row execute function public.guard_claimant_agreement_envelope_update();

create trigger claimant_agreement_envelopes_final_document_guard
before update of final_document_id on public.claimant_agreement_envelopes
for each row execute function public.guard_claimant_agreement_final_document();

create trigger claimant_agreement_envelopes_reject_delete
before delete on public.claimant_agreement_envelopes
for each row execute function public.reject_claimant_agreement_envelope_delete();

create trigger claimant_agreement_events_reject_update_delete
before update or delete on public.claimant_agreement_events
for each row execute function public.reject_claimant_agreement_event_mutation();

create trigger claimant_agreement_events_reject_truncate
before truncate on public.claimant_agreement_events
for each statement execute function public.reject_claimant_agreement_event_mutation();

alter table public.claimant_agreement_templates enable row level security;
alter table public.claimant_agreement_envelopes enable row level security;
alter table public.claimant_agreement_events enable row level security;

revoke all on table public.claimant_agreement_templates from public, anon, authenticated;
revoke all on table public.claimant_agreement_envelopes from public, anon, authenticated;
revoke all on table public.claimant_agreement_events from public, anon, authenticated;

grant select, insert, update on table public.claimant_agreement_templates to service_role;
grant select, insert, update on table public.claimant_agreement_envelopes to service_role;
grant select, insert on table public.claimant_agreement_events to service_role;

revoke execute on function public.guard_claimant_agreement_template_update() from public, anon, authenticated;
revoke execute on function public.reject_claimant_agreement_template_delete() from public, anon, authenticated;
revoke execute on function public.guard_claimant_agreement_envelope_update() from public, anon, authenticated;
revoke execute on function public.guard_claimant_agreement_final_document() from public, anon, authenticated;
revoke execute on function public.reject_claimant_agreement_envelope_delete() from public, anon, authenticated;
revoke execute on function public.reject_claimant_agreement_event_mutation() from public, anon, authenticated;;
