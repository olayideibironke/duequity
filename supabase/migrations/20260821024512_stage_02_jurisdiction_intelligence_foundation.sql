create table public.jurisdiction_evidence_packets (
  schema_version smallint not null default 1 check (schema_version = 1),
  packet_id text not null check (btrim(packet_id) <> ''),
  packet_hash text not null check (packet_hash ~ '^[0-9a-f]{64}$'),
  scope text not null check (scope in ('state','county')),
  state_fips text not null check (state_fips ~ '^[0-9]{2}$'),
  state_code text not null check (state_code ~ '^[A-Z]{2}$'),
  state_name text not null check (btrim(state_name) <> ''),
  county_geoid text,
  county_name text,
  sale_type text not null check (btrim(sale_type) <> ''),
  harvested_at timestamptz not null,
  evidence_status text not null check (evidence_status in ('complete','partial','failed')),
  domains_attempted integer not null check (domains_attempted >= 0),
  html_pages_retrieved integer not null check (html_pages_retrieved >= 0),
  documents_discovered integer not null check (documents_discovered >= 0),
  retrieval_failures integer not null check (retrieval_failures >= 0),
  process_context_sources integer not null check (process_context_sources >= 0),
  recovery_rule_sources integer not null check (recovery_rule_sources >= 0),
  local_procedure_sources integer not null check (local_procedure_sources >= 0),
  legal_rules_created boolean not null default false check (legal_rules_created = false),
  jurisdiction_approved boolean not null default false check (jurisdiction_approved = false),
  intake_allowed boolean not null default false check (intake_allowed = false),
  discovery_terms jsonb not null default '[]'::jsonb check (jsonb_typeof(discovery_terms) = 'array'),
  domains jsonb not null default '[]'::jsonb check (jsonb_typeof(domains) = 'array'),
  ingested_at timestamptz not null default now(),
  primary key (packet_id, packet_hash),
  constraint jurisdiction_evidence_scope_chk check (
    (scope = 'state' and county_geoid is null and county_name is null)
    or
    (scope = 'county' and county_geoid is not null and county_name is not null and btrim(county_name) <> '' and county_geoid ~ '^[0-9]{5}$' and left(county_geoid, 2) = state_fips)
  )
);

comment on table public.jurisdiction_evidence_packets is
  'Immutable DueQuity jurisdiction evidence snapshots. Evidence is research provenance only and cannot itself create legal rules, approve a jurisdiction, or authorize intake.';
comment on column public.jurisdiction_evidence_packets.packet_hash is
  'Literal lowercase SHA-256 hex from the source packet. Existing hashes must be copied byte-identically and never recomputed during migration.';

create unique index jurisdiction_evidence_state_snapshot_uidx
  on public.jurisdiction_evidence_packets (state_fips, sale_type, packet_hash)
  where scope = 'state';
create unique index jurisdiction_evidence_county_snapshot_uidx
  on public.jurisdiction_evidence_packets (state_fips, county_geoid, sale_type, packet_hash)
  where scope = 'county';
create index jurisdiction_evidence_state_lookup_idx
  on public.jurisdiction_evidence_packets (state_fips, sale_type, harvested_at desc)
  where scope = 'state';
create index jurisdiction_evidence_county_lookup_idx
  on public.jurisdiction_evidence_packets (state_fips, county_geoid, sale_type, harvested_at desc)
  where scope = 'county';
create index jurisdiction_evidence_status_idx
  on public.jurisdiction_evidence_packets (evidence_status, harvested_at desc);

create table public.jurisdiction_review_drafts (
  id text primary key check (btrim(id) <> ''),
  schema_version smallint not null default 1 check (schema_version = 1),
  revision bigint not null check (revision > 0),
  row_version bigint not null default 1 check (row_version > 0),
  scope text not null check (scope in ('state','county')),
  state_fips text not null check (state_fips ~ '^[0-9]{2}$'),
  state_code text not null check (state_code ~ '^[A-Z]{2}$'),
  state_name text not null check (btrim(state_name) <> ''),
  county_geoid text,
  county_name text,
  sale_type text not null check (btrim(sale_type) <> ''),
  status text not null default 'draft' check (status in ('draft','ready_for_approval','changes_required','approved')),

  evidence_packet_id text not null,
  evidence_packet_hash text not null check (evidence_packet_hash ~ '^[0-9a-f]{64}$'),
  evidence_status text not null check (evidence_status in ('complete','partial','failed')),
  evidence_harvested_at timestamptz not null,
  source_candidates jsonb not null default '[]'::jsonb check (jsonb_typeof(source_candidates) = 'array'),
  additional_sources jsonb not null default '[]'::jsonb check (jsonb_typeof(additional_sources) = 'array'),
  selected_source_ids text[] not null default '{}'::text[],
  reviewed_findings text[] not null default '{}'::text[],
  finding_source_ids jsonb not null default '{}'::jsonb check (jsonb_typeof(finding_source_ids) = 'object'),

  jurisdiction_id text,
  agency_name text,
  agency_website text,
  agency_phone text,
  agency_address jsonb,
  custodian text,
  claim_method text,
  claim_form_url text,
  required_documents text[],
  claim_deadline_days integer check (claim_deadline_days is null or claim_deadline_days >= 0),
  statute_reference text,
  permitted_fee_models text[],
  fee_cap_percent numeric(9,8) check (fee_cap_percent is null or (fee_cap_percent >= 0 and fee_cap_percent <= 1)),
  fee_cap_amount_cents bigint check (fee_cap_amount_cents is null or fee_cap_amount_cents >= 0),
  assignment_permitted boolean,
  power_of_attorney_accepted boolean,
  finder_license_required boolean,
  bond_required boolean,
  attorney_required boolean,
  mandatory_contract_language text[],
  cancellation_period_days integer check (cancellation_period_days is null or cancellation_period_days >= 0),
  payment_routing_note text,
  probate_required_when_deceased boolean,
  compliance_status text check (compliance_status is null or compliance_status in ('research_required','under_legal_review','approved','attorney_only','restricted','paused')),
  legal_processing_rule text check (legal_processing_rule is null or legal_processing_rule in ('administrative_permitted','legal_review_recommended','attorney_mandatory','restricted','not_yet_approved')),
  legal_rule_effective_from date,
  legal_rule_effective_through date,
  legal_review_due_at date,
  internal_notes text,

  payment_route text not null default 'unknown' check (payment_route in ('claimant_only','authorized_representative','joint_payee','split_disbursement','assignee','unknown')),
  payment_launch_track text not null default 'blocked' check (payment_launch_track in ('direct_claimant_recovery','managed_representative_recovery','future_acquisition','blocked')),
  representative_may_file text not null default 'unknown' check (representative_may_file in ('yes','no','unknown')),
  representative_may_receive_payment text not null default 'unknown' check (representative_may_receive_payment in ('yes','no','unknown')),
  assignment_required_for_representative_payment text not null default 'unknown' check (assignment_required_for_representative_payment in ('yes','no','unknown')),
  fee_collection_method text not null default 'unknown' check (fee_collection_method in ('contractual_post_recovery','representative_disbursement','joint_payee_disbursement','split_disbursement','assignment_acquisition','unknown')),
  payment_route_ready boolean not null default false,

  legal_gate text not null default 'blocked' check (legal_gate in ('permitted','conditional','blocked')),
  claim_submission_gate text not null default 'blocked' check (claim_submission_gate in ('permitted','conditional','blocked')),
  fee_gate text not null default 'blocked' check (fee_gate in ('permitted','conditional','blocked')),
  payment_gate text not null default 'blocked' check (payment_gate in ('permitted','conditional','blocked')),
  gate_details jsonb not null default '{}'::jsonb check (jsonb_typeof(gate_details) = 'object'),

  review_reason text,
  conflict_reason text,
  review_notes text,
  created_by_user_id text not null check (btrim(created_by_user_id) <> ''),
  created_by_name text not null check (btrim(created_by_name) <> ''),
  created_at timestamptz not null default now(),
  updated_by_user_id text not null check (btrim(updated_by_user_id) <> ''),
  updated_by_name text not null check (btrim(updated_by_name) <> ''),
  updated_at timestamptz not null default now(),
  approved_package_id text,
  approved_package_version bigint check (approved_package_version is null or approved_package_version > 0),
  approved_by_user_id text,
  approved_by_name text,
  approved_at timestamptz,

  constraint jurisdiction_review_scope_chk check (
    (scope = 'state' and county_geoid is null and county_name is null)
    or
    (scope = 'county' and county_geoid is not null and county_name is not null and btrim(county_name) <> '' and county_geoid ~ '^[0-9]{5}$' and left(county_geoid, 2) = state_fips)
  ),
  constraint jurisdiction_review_effective_dates_chk check (
    legal_rule_effective_through is null or legal_rule_effective_from is null or legal_rule_effective_through >= legal_rule_effective_from
  ),
  constraint jurisdiction_review_payment_ready_chk check (
    payment_route_ready = false
    or (
      payment_route = 'claimant_only'
      and payment_launch_track = 'direct_claimant_recovery'
      and fee_collection_method = 'contractual_post_recovery'
    )
    or (
      payment_launch_track = 'managed_representative_recovery'
      and payment_route in ('authorized_representative','joint_payee','split_disbursement')
      and representative_may_file in ('yes','no')
      and representative_may_receive_payment = 'yes'
      and assignment_required_for_representative_payment = 'no'
      and (
        (payment_route = 'authorized_representative' and fee_collection_method = 'representative_disbursement')
        or (payment_route = 'joint_payee' and fee_collection_method = 'joint_payee_disbursement')
        or (payment_route = 'split_disbursement' and fee_collection_method = 'split_disbursement')
      )
    )
  ),
  constraint jurisdiction_review_payment_permitted_requires_ready_chk check (
    payment_gate <> 'permitted' or payment_route_ready = true
  ),
  constraint jurisdiction_review_payment_blocked_routes_chk check (
    not (
      payment_route in ('unknown','assignee')
      or payment_launch_track in ('blocked','future_acquisition')
      or fee_collection_method in ('unknown','assignment_acquisition')
      or (
        payment_launch_track = 'managed_representative_recovery'
        and (
          representative_may_file = 'unknown'
          or representative_may_receive_payment <> 'yes'
          or assignment_required_for_representative_payment <> 'no'
        )
      )
    )
    or payment_gate = 'blocked'
  ),
  constraint jurisdiction_review_approval_tuple_chk check (
    (
      approved_package_id is null and approved_package_version is null and approved_by_user_id is null and approved_by_name is null and approved_at is null
      and status <> 'approved'
    )
    or (
      approved_package_id is not null and approved_package_version is not null and approved_by_user_id is not null and btrim(approved_by_user_id) <> ''
      and approved_by_name is not null and btrim(approved_by_name) <> '' and approved_at is not null and status = 'approved'
    )
  ),
  foreign key (evidence_packet_id, evidence_packet_hash)
    references public.jurisdiction_evidence_packets(packet_id, packet_hash)
    on update restrict on delete restrict
);

comment on table public.jurisdiction_review_drafts is
  'Human-governed DueQuity jurisdiction legal/compliance review workspace. Unknown findings remain structurally distinct from false; approved revisions become immutable.';

create unique index jurisdiction_review_state_revision_uidx
  on public.jurisdiction_review_drafts (state_fips, sale_type, revision)
  where scope = 'state';
create unique index jurisdiction_review_county_revision_uidx
  on public.jurisdiction_review_drafts (state_fips, county_geoid, sale_type, revision)
  where scope = 'county';
create index jurisdiction_review_state_lookup_idx
  on public.jurisdiction_review_drafts (state_fips, sale_type, revision desc)
  where scope = 'state';
create index jurisdiction_review_county_lookup_idx
  on public.jurisdiction_review_drafts (state_fips, county_geoid, sale_type, revision desc)
  where scope = 'county';
create index jurisdiction_review_status_idx
  on public.jurisdiction_review_drafts (status, updated_at desc);
create index jurisdiction_review_evidence_idx
  on public.jurisdiction_review_drafts (evidence_packet_id, evidence_packet_hash);

create table public.jurisdiction_rule_packages (
  package_id text not null check (btrim(package_id) <> ''),
  version bigint not null check (version > 0),
  scope text not null check (scope in ('state','county')),
  state_fips text not null check (state_fips ~ '^[0-9]{2}$'),
  state_code text not null check (state_code ~ '^[A-Z]{2}$'),
  state_name text not null check (btrim(state_name) <> ''),
  county_geoid text,
  county_name text,
  sale_type text not null check (btrim(sale_type) <> ''),
  status text not null check (status = 'approved'),
  jurisdiction_id text not null check (btrim(jurisdiction_id) <> ''),
  legal_rule_version bigint not null check (legal_rule_version > 0),
  intake_authorized boolean not null default false,

  agency_name text not null check (btrim(agency_name) <> ''),
  agency_website text,
  agency_phone text,
  agency_address jsonb,
  custodian text not null check (btrim(custodian) <> ''),
  claim_method text not null check (btrim(claim_method) <> ''),
  claim_form_url text,
  required_documents text[] not null,
  claim_deadline_days integer check (claim_deadline_days is null or claim_deadline_days >= 0),
  statute_reference text,
  permitted_fee_models text[] not null,
  fee_cap_percent numeric(9,8) check (fee_cap_percent is null or (fee_cap_percent >= 0 and fee_cap_percent <= 1)),
  fee_cap_amount_cents bigint check (fee_cap_amount_cents is null or fee_cap_amount_cents >= 0),
  assignment_permitted boolean not null,
  power_of_attorney_accepted boolean not null,
  finder_license_required boolean not null,
  bond_required boolean not null,
  attorney_required boolean not null,
  mandatory_contract_language text[],
  cancellation_period_days integer check (cancellation_period_days is null or cancellation_period_days >= 0),
  payment_routing_note text,
  probate_required_when_deceased boolean not null,
  compliance_status text not null check (compliance_status in ('research_required','under_legal_review','approved','attorney_only','restricted','paused')),
  legal_processing_rule text not null check (legal_processing_rule in ('administrative_permitted','legal_review_recommended','attorney_mandatory','restricted','not_yet_approved')),
  legal_rule_effective_from date,
  legal_rule_effective_through date,
  legal_review_due_at date,
  internal_notes text,

  payment_route text not null check (payment_route in ('claimant_only','authorized_representative','joint_payee','split_disbursement','assignee','unknown')),
  payment_launch_track text not null check (payment_launch_track in ('direct_claimant_recovery','managed_representative_recovery','future_acquisition','blocked')),
  representative_may_file text not null check (representative_may_file in ('yes','no','unknown')),
  representative_may_receive_payment text not null check (representative_may_receive_payment in ('yes','no','unknown')),
  assignment_required_for_representative_payment text not null check (assignment_required_for_representative_payment in ('yes','no','unknown')),
  fee_collection_method text not null check (fee_collection_method in ('contractual_post_recovery','representative_disbursement','joint_payee_disbursement','split_disbursement','assignment_acquisition','unknown')),
  payment_route_ready boolean not null,

  legal_gate text not null check (legal_gate in ('permitted','conditional','blocked')),
  claim_submission_gate text not null check (claim_submission_gate in ('permitted','conditional','blocked')),
  fee_gate text not null check (fee_gate in ('permitted','conditional','blocked')),
  payment_gate text not null check (payment_gate in ('permitted','conditional','blocked')),
  gate_details jsonb not null check (jsonb_typeof(gate_details) = 'object'),

  evidence_packet_id text not null,
  evidence_packet_hash text not null check (evidence_packet_hash ~ '^[0-9a-f]{64}$'),
  review_draft_id text not null,
  sources_snapshot jsonb not null check (jsonb_typeof(sources_snapshot) = 'array' and jsonb_array_length(sources_snapshot) > 0),
  approved_by_user_id text not null check (btrim(approved_by_user_id) <> ''),
  approved_by_name text not null check (btrim(approved_by_name) <> ''),
  approved_at timestamptz not null,
  last_legal_review date not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,

  primary key (package_id, version),
  constraint jurisdiction_package_scope_chk check (
    (scope = 'state' and county_geoid is null and county_name is null)
    or
    (scope = 'county' and county_geoid is not null and county_name is not null and btrim(county_name) <> '' and county_geoid ~ '^[0-9]{5}$' and left(county_geoid, 2) = state_fips)
  ),
  constraint jurisdiction_package_effective_dates_chk check (
    legal_rule_effective_through is null or legal_rule_effective_from is null or legal_rule_effective_through >= legal_rule_effective_from
  ),
  constraint jurisdiction_package_payment_ready_chk check (
    payment_route_ready = false
    or (
      payment_route = 'claimant_only'
      and payment_launch_track = 'direct_claimant_recovery'
      and fee_collection_method = 'contractual_post_recovery'
    )
    or (
      payment_launch_track = 'managed_representative_recovery'
      and payment_route in ('authorized_representative','joint_payee','split_disbursement')
      and representative_may_file in ('yes','no')
      and representative_may_receive_payment = 'yes'
      and assignment_required_for_representative_payment = 'no'
      and (
        (payment_route = 'authorized_representative' and fee_collection_method = 'representative_disbursement')
        or (payment_route = 'joint_payee' and fee_collection_method = 'joint_payee_disbursement')
        or (payment_route = 'split_disbursement' and fee_collection_method = 'split_disbursement')
      )
    )
  ),
  constraint jurisdiction_package_payment_permitted_requires_ready_chk check (
    payment_gate <> 'permitted' or payment_route_ready = true
  ),
  constraint jurisdiction_package_payment_blocked_routes_chk check (
    not (
      payment_route in ('unknown','assignee')
      or payment_launch_track in ('blocked','future_acquisition')
      or fee_collection_method in ('unknown','assignment_acquisition')
      or (
        payment_launch_track = 'managed_representative_recovery'
        and (
          representative_may_file = 'unknown'
          or representative_may_receive_payment <> 'yes'
          or assignment_required_for_representative_payment <> 'no'
        )
      )
    )
    or payment_gate = 'blocked'
  ),
  constraint jurisdiction_package_intake_authorized_chk check (
    intake_authorized = false
    or (
      status = 'approved'
      and compliance_status = 'approved'
      and legal_processing_rule = 'administrative_permitted'
      and attorney_required = false
      and legal_gate = 'permitted'
      and claim_submission_gate = 'permitted'
      and fee_gate = 'permitted'
      and payment_gate = 'permitted'
      and payment_route_ready = true
      and payment_launch_track in ('direct_claimant_recovery','managed_representative_recovery')
      and payment_route not in ('unknown','assignee')
      and fee_collection_method not in ('unknown','assignment_acquisition')
    )
  ),
  constraint jurisdiction_package_timestamps_chk check (updated_at = approved_at and created_at <= updated_at),
  foreign key (evidence_packet_id, evidence_packet_hash)
    references public.jurisdiction_evidence_packets(packet_id, packet_hash)
    on update restrict on delete restrict,
  foreign key (review_draft_id)
    references public.jurisdiction_review_drafts(id)
    on update restrict on delete restrict,
  unique (review_draft_id),
  unique (jurisdiction_id, version)
);

comment on table public.jurisdiction_rule_packages is
  'Immutable DueQuity jurisdiction rule-package publication history. status=approved freezes a legal/compliance determination; intake_authorized separately freezes whether DueQuity Startup Green Lane intake was authorized for this exact version.';
comment on column public.jurisdiction_rule_packages.updated_at is
  'Immutable publication timestamp retained for compatibility with the existing package contract. Published package rows have no update path.';

create unique index jurisdiction_package_state_version_uidx
  on public.jurisdiction_rule_packages (state_fips, sale_type, version)
  where scope = 'state';
create unique index jurisdiction_package_county_version_uidx
  on public.jurisdiction_rule_packages (state_fips, county_geoid, sale_type, version)
  where scope = 'county';
create index jurisdiction_package_state_lookup_idx
  on public.jurisdiction_rule_packages (state_fips, sale_type, version desc)
  where scope = 'state';
create index jurisdiction_package_county_lookup_idx
  on public.jurisdiction_rule_packages (state_fips, county_geoid, sale_type, version desc)
  where scope = 'county';
create index jurisdiction_package_jurisdiction_version_idx
  on public.jurisdiction_rule_packages (jurisdiction_id, version desc);

alter table public.jurisdiction_review_drafts
  add constraint jurisdiction_review_approved_package_fkey
  foreign key (approved_package_id, approved_package_version)
  references public.jurisdiction_rule_packages(package_id, version)
  on update restrict on delete restrict;

create or replace function public.reject_immutable_jurisdiction_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  raise exception '% is immutable: % is not permitted', tg_table_name, tg_op
    using errcode = '42501';
end;
$$;

create trigger jurisdiction_evidence_reject_update_delete
before update or delete on public.jurisdiction_evidence_packets
for each row execute function public.reject_immutable_jurisdiction_mutation();
create trigger jurisdiction_evidence_reject_truncate
before truncate on public.jurisdiction_evidence_packets
for each statement execute function public.reject_immutable_jurisdiction_mutation();

create trigger jurisdiction_package_reject_update_delete
before update or delete on public.jurisdiction_rule_packages
for each row execute function public.reject_immutable_jurisdiction_mutation();
create trigger jurisdiction_package_reject_truncate
before truncate on public.jurisdiction_rule_packages
for each statement execute function public.reject_immutable_jurisdiction_mutation();

create or replace function public.guard_jurisdiction_review_lifecycle()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  v_approval_owner name;
begin
  if tg_op = 'INSERT' then
    if new.status <> 'draft' then
      raise exception 'New jurisdiction reviews must begin in draft status.' using errcode = '42501';
    end if;
    new.row_version := 1;
    return new;
  end if;

  if old.status = 'approved' then
    raise exception 'Approved jurisdiction review revisions are immutable.' using errcode = '42501';
  end if;

  if new.schema_version is distinct from old.schema_version
     or new.revision is distinct from old.revision
     or new.state_fips is distinct from old.state_fips
     or new.state_code is distinct from old.state_code
     or new.state_name is distinct from old.state_name
     or new.sale_type is distinct from old.sale_type
     or new.evidence_packet_id is distinct from old.evidence_packet_id
     or new.evidence_packet_hash is distinct from old.evidence_packet_hash
     or new.evidence_status is distinct from old.evidence_status
     or new.evidence_harvested_at is distinct from old.evidence_harvested_at
     or new.source_candidates is distinct from old.source_candidates
     or new.created_by_user_id is distinct from old.created_by_user_id
     or new.created_by_name is distinct from old.created_by_name
     or new.created_at is distinct from old.created_at then
    raise exception 'Jurisdiction review identity and evidence provenance fields are immutable.' using errcode = '42501';
  end if;

  if new.status = 'approved' and old.status <> 'approved' then
    select pg_catalog.pg_get_userbyid(p.proowner)
      into v_approval_owner
    from pg_catalog.pg_proc p
    where p.oid = 'public.approve_jurisdiction_review_draft(text,bigint,uuid)'::pg_catalog.regprocedure;

    if v_approval_owner is null or current_user <> v_approval_owner then
      raise exception 'Jurisdiction reviews may transition to approved only through the controlled approval function.' using errcode = '42501';
    end if;

    new.updated_at := new.approved_at;
  else
    if new.approved_package_id is not null or new.approved_package_version is not null or new.approved_by_user_id is not null or new.approved_by_name is not null or new.approved_at is not null then
      raise exception 'Approval provenance may only be written by the controlled approval function.' using errcode = '42501';
    end if;
    new.updated_at := pg_catalog.clock_timestamp();
  end if;

  new.row_version := old.row_version + 1;
  return new;
end;
$$;

create trigger jurisdiction_review_lifecycle_guard
before insert or update on public.jurisdiction_review_drafts
for each row execute function public.guard_jurisdiction_review_lifecycle();

create or replace function public.approve_jurisdiction_review_draft(
  p_review_id text,
  p_expected_row_version bigint,
  p_approver_id uuid
)
returns table (
  package_id text,
  package_version bigint,
  legal_rule_version bigint,
  intake_authorized boolean
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_review public.jurisdiction_review_drafts%rowtype;
  v_evidence public.jurisdiction_evidence_packets%rowtype;
  v_staff public.staff_users%rowtype;
  v_package_id text;
  v_jurisdiction_id text;
  v_package_version bigint;
  v_legal_rule_version bigint;
  v_intake_authorized boolean;
  v_approved_at timestamptz;
  v_created_at timestamptz;
  v_sources jsonb;
  v_all_sources jsonb;
  v_selected_count integer;
  v_selected_distinct_count integer;
  v_required_findings text[] := array[
    'agency_contact','custodian','claim_method','required_documents','claim_deadline','controlling_authority','fee_models','percentage_fee_cap','amount_fee_cap','assignment','power_of_attorney','finder_license','bond','attorney_requirement','contract_language','cancellation_period','payment_routing','probate_requirement','compliance_status','legal_processing_rule'
  ]::text[];
  v_lock_key text;
begin
  if p_review_id is null or btrim(p_review_id) = '' then
    raise exception 'Review id is required.' using errcode = '22023';
  end if;
  if p_expected_row_version is null or p_expected_row_version < 1 then
    raise exception 'Expected row_version must be a positive integer.' using errcode = '22023';
  end if;
  if p_approver_id is null then
    raise exception 'Approver staff UUID is required.' using errcode = '22023';
  end if;

  select r.* into v_review
  from public.jurisdiction_review_drafts r
  where r.id = p_review_id
  for update;

  if not found then
    raise exception 'Jurisdiction review draft not found: %', p_review_id using errcode = 'P0002';
  end if;

  if v_review.row_version <> p_expected_row_version then
    raise exception 'Jurisdiction review row_version is stale. Expected %, current %.', p_expected_row_version, v_review.row_version using errcode = '40001';
  end if;

  if v_review.status <> 'ready_for_approval' then
    raise exception 'Jurisdiction review must be ready_for_approval before publication. Current status: %', v_review.status using errcode = '23514';
  end if;

  select s.* into v_staff
  from public.staff_users s
  where s.id = p_approver_id;

  if not found then
    raise exception 'Active staff approver identity was not found.' using errcode = '42501';
  end if;

  if v_staff.status <> 'active' then
    raise exception 'Staff approver account is not active.' using errcode = '42501';
  end if;

  select e.* into v_evidence
  from public.jurisdiction_evidence_packets e
  where e.packet_id = v_review.evidence_packet_id
    and e.packet_hash = v_review.evidence_packet_hash;

  if not found then
    raise exception 'Referenced immutable jurisdiction evidence packet was not found.' using errcode = '23503';
  end if;

  if v_evidence.state_fips <> v_review.state_fips
     or v_evidence.state_code <> v_review.state_code
     or v_evidence.sale_type <> v_review.sale_type
     or v_evidence.harvested_at <> v_review.evidence_harvested_at
     or v_evidence.evidence_status <> v_review.evidence_status then
    raise exception 'Review evidence provenance does not match its immutable evidence packet.' using errcode = '23514';
  end if;

  if v_review.evidence_status <> 'complete' then
    raise exception 'Jurisdiction evidence must be complete before publication.' using errcode = '23514';
  end if;

  if not (v_required_findings <@ v_review.reviewed_findings) then
    raise exception 'Jurisdiction review is missing one or more required reviewed findings.' using errcode = '23514';
  end if;

  if cardinality(v_review.selected_source_ids) = 0 then
    raise exception 'At least one official source must be selected before publication.' using errcode = '23514';
  end if;

  v_all_sources := v_review.source_candidates || v_review.additional_sources;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(v_all_sources) as s(elem)
    where nullif(btrim(s.elem->>'id'), '') is null
       or nullif(btrim(s.elem->>'authorityName'), '') is null
       or nullif(btrim(s.elem->>'url'), '') is null
       or (s.elem ? 'contentHash' and s.elem->>'contentHash' is not null and s.elem->>'contentHash' !~ '^[0-9a-f]{64}$')
  ) then
    raise exception 'Jurisdiction authority source provenance is malformed.' using errcode = '23514';
  end if;

  select count(*), count(distinct s.elem->>'id')
    into v_selected_count, v_selected_distinct_count
  from pg_catalog.jsonb_array_elements(v_all_sources) as s(elem)
  where s.elem->>'id' = any(v_review.selected_source_ids);

  if v_selected_count <> cardinality(v_review.selected_source_ids)
     or v_selected_distinct_count <> cardinality(v_review.selected_source_ids) then
    raise exception 'Selected jurisdiction sources must each resolve exactly once in the review evidence.' using errcode = '23514';
  end if;

  if exists (
    select 1 from pg_catalog.jsonb_each(v_review.finding_source_ids) f(key, value)
    where pg_catalog.jsonb_typeof(f.value) <> 'array'
  ) then
    raise exception 'finding_source_ids values must be JSON arrays.' using errcode = '23514';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_each(v_review.finding_source_ids) f(key, value)
    cross join lateral pg_catalog.jsonb_array_elements_text(f.value) sid(source_id)
    where not exists (
      select 1
      from pg_catalog.jsonb_array_elements(v_all_sources) s(elem)
      where s.elem->>'id' = sid.source_id
    )
  ) then
    raise exception 'A finding references an unavailable jurisdiction source.' using errcode = '23514';
  end if;

  select pg_catalog.coalesce(pg_catalog.jsonb_agg(x.elem order by x.ord), '[]'::jsonb)
    into v_sources
  from (
    select s.elem, s.ord
    from pg_catalog.jsonb_array_elements(v_all_sources) with ordinality as s(elem, ord)
    where s.elem->>'id' = any(v_review.selected_source_ids)
  ) x;

  if pg_catalog.jsonb_array_length(v_sources) = 0 then
    raise exception 'An approved jurisdiction rule requires at least one authoritative source.' using errcode = '23514';
  end if;

  if nullif(btrim(v_review.agency_name), '') is null
     or nullif(btrim(v_review.custodian), '') is null
     or nullif(btrim(v_review.claim_method), '') is null
     or v_review.required_documents is null
     or v_review.permitted_fee_models is null
     or v_review.assignment_permitted is null
     or v_review.power_of_attorney_accepted is null
     or v_review.finder_license_required is null
     or v_review.bond_required is null
     or v_review.attorney_required is null
     or v_review.probate_required_when_deceased is null
     or v_review.compliance_status is null
     or v_review.legal_processing_rule is null then
    raise exception 'Jurisdiction review is missing required canonical operational values.' using errcode = '23514';
  end if;

  if v_review.payment_route_ready then
    if not (
      (v_review.payment_route = 'claimant_only'
       and v_review.payment_launch_track = 'direct_claimant_recovery'
       and v_review.fee_collection_method = 'contractual_post_recovery')
      or
      (v_review.payment_launch_track = 'managed_representative_recovery'
       and v_review.payment_route in ('authorized_representative','joint_payee','split_disbursement')
       and v_review.representative_may_file in ('yes','no')
       and v_review.representative_may_receive_payment = 'yes'
       and v_review.assignment_required_for_representative_payment = 'no'
       and (
         (v_review.payment_route = 'authorized_representative' and v_review.fee_collection_method = 'representative_disbursement')
         or (v_review.payment_route = 'joint_payee' and v_review.fee_collection_method = 'joint_payee_disbursement')
         or (v_review.payment_route = 'split_disbursement' and v_review.fee_collection_method = 'split_disbursement')
       ))
    ) then
      raise exception 'Payment readiness is inconsistent with the approved Startup Green Lane route model.' using errcode = '23514';
    end if;
  end if;

  v_lock_key := v_review.state_fips || ':' || v_review.scope || ':' || pg_catalog.coalesce(v_review.county_geoid, 'STATE') || ':' || v_review.sale_type;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_lock_key, 0::bigint));

  v_package_id := 'jurpkg-' || v_review.state_fips || '-' || pg_catalog.coalesce(v_review.county_geoid, 'state') || '-' || v_review.sale_type;
  v_jurisdiction_id := pg_catalog.coalesce(nullif(btrim(v_review.jurisdiction_id), ''), 'jur-' || lower(v_review.state_code) || '-' || pg_catalog.coalesce(v_review.county_geoid, 'state') || '-' || v_review.sale_type);

  select pg_catalog.coalesce(max(p.version), 0) + 1
    into v_package_version
  from public.jurisdiction_rule_packages p
  where p.package_id = v_package_id;

  select pg_catalog.coalesce(max(p.legal_rule_version), 0) + 1
    into v_legal_rule_version
  from public.jurisdiction_rule_packages p
  where p.jurisdiction_id = v_jurisdiction_id;

  select min(p.created_at)
    into v_created_at
  from public.jurisdiction_rule_packages p
  where p.package_id = v_package_id;
  v_created_at := pg_catalog.coalesce(v_created_at, v_review.created_at);

  v_approved_at := pg_catalog.clock_timestamp();

  v_intake_authorized := (
    v_review.compliance_status = 'approved'
    and v_review.legal_processing_rule = 'administrative_permitted'
    and v_review.attorney_required = false
    and v_review.legal_gate = 'permitted'
    and v_review.claim_submission_gate = 'permitted'
    and v_review.fee_gate = 'permitted'
    and v_review.payment_gate = 'permitted'
    and v_review.payment_route_ready = true
    and v_review.payment_launch_track in ('direct_claimant_recovery','managed_representative_recovery')
    and v_review.payment_route not in ('unknown','assignee')
    and v_review.fee_collection_method not in ('unknown','assignment_acquisition')
  );

  insert into public.jurisdiction_rule_packages (
    package_id, version, scope, state_fips, state_code, state_name, county_geoid, county_name, sale_type, status,
    jurisdiction_id, legal_rule_version, intake_authorized,
    agency_name, agency_website, agency_phone, agency_address, custodian, claim_method, claim_form_url,
    required_documents, claim_deadline_days, statute_reference, permitted_fee_models, fee_cap_percent, fee_cap_amount_cents,
    assignment_permitted, power_of_attorney_accepted, finder_license_required, bond_required, attorney_required,
    mandatory_contract_language, cancellation_period_days, payment_routing_note, probate_required_when_deceased,
    compliance_status, legal_processing_rule, legal_rule_effective_from, legal_rule_effective_through, legal_review_due_at, internal_notes,
    payment_route, payment_launch_track, representative_may_file, representative_may_receive_payment,
    assignment_required_for_representative_payment, fee_collection_method, payment_route_ready,
    legal_gate, claim_submission_gate, fee_gate, payment_gate, gate_details,
    evidence_packet_id, evidence_packet_hash, review_draft_id, sources_snapshot,
    approved_by_user_id, approved_by_name, approved_at, last_legal_review, created_at, updated_at
  ) values (
    v_package_id, v_package_version, v_review.scope, v_review.state_fips, v_review.state_code, v_review.state_name,
    v_review.county_geoid, v_review.county_name, v_review.sale_type, 'approved',
    v_jurisdiction_id, v_legal_rule_version, v_intake_authorized,
    v_review.agency_name, v_review.agency_website, v_review.agency_phone, v_review.agency_address, v_review.custodian,
    v_review.claim_method, v_review.claim_form_url, v_review.required_documents, v_review.claim_deadline_days,
    v_review.statute_reference, v_review.permitted_fee_models, v_review.fee_cap_percent, v_review.fee_cap_amount_cents,
    v_review.assignment_permitted, v_review.power_of_attorney_accepted, v_review.finder_license_required, v_review.bond_required,
    v_review.attorney_required, v_review.mandatory_contract_language, v_review.cancellation_period_days, v_review.payment_routing_note,
    v_review.probate_required_when_deceased, v_review.compliance_status, v_review.legal_processing_rule,
    v_review.legal_rule_effective_from, v_review.legal_rule_effective_through, v_review.legal_review_due_at, v_review.internal_notes,
    v_review.payment_route, v_review.payment_launch_track, v_review.representative_may_file,
    v_review.representative_may_receive_payment, v_review.assignment_required_for_representative_payment,
    v_review.fee_collection_method, v_review.payment_route_ready,
    v_review.legal_gate, v_review.claim_submission_gate, v_review.fee_gate, v_review.payment_gate, v_review.gate_details,
    v_review.evidence_packet_id, v_review.evidence_packet_hash, v_review.id, v_sources,
    v_staff.id::text, v_staff.name, v_approved_at, (v_approved_at at time zone 'UTC')::date, v_created_at, v_approved_at
  );

  update public.jurisdiction_review_drafts r
  set status = 'approved',
      approved_package_id = v_package_id,
      approved_package_version = v_package_version,
      approved_by_user_id = v_staff.id::text,
      approved_by_name = v_staff.name,
      approved_at = v_approved_at,
      updated_by_user_id = v_staff.id::text,
      updated_by_name = v_staff.name,
      updated_at = v_approved_at
  where r.id = v_review.id;

  insert into public.audit_events (
    occurred_at, actor_id, actor_name, actor_role, action, target_type, target_id, target_label, outcome, detail,
    chain_position, previous_event_hash, event_hash
  ) values (
    v_approved_at,
    v_staff.id::text,
    v_staff.name,
    v_staff.role,
    'jurisdiction.rule_updated',
    'jurisdiction',
    v_jurisdiction_id,
    case when v_review.scope = 'county' then v_review.county_name || ', ' || v_review.state_code else v_review.state_name end,
    'success',
    pg_catalog.jsonb_build_object(
      'reviewId', v_review.id,
      'packageId', v_package_id,
      'packageVersion', v_package_version,
      'legalRuleVersion', v_legal_rule_version,
      'evidencePacketHash', v_review.evidence_packet_hash,
      'scope', v_review.scope,
      'intakeAuthorized', v_intake_authorized
    )::text,
    1,
    null,
    '\x00'::bytea
  );

  return query select v_package_id, v_package_version, v_legal_rule_version, v_intake_authorized;
end;
$$;

alter table public.jurisdiction_evidence_packets enable row level security;
alter table public.jurisdiction_review_drafts enable row level security;
alter table public.jurisdiction_rule_packages enable row level security;

revoke all privileges on table public.jurisdiction_evidence_packets from public, anon, authenticated, service_role;
revoke all privileges on table public.jurisdiction_review_drafts from public, anon, authenticated, service_role;
revoke all privileges on table public.jurisdiction_rule_packages from public, anon, authenticated, service_role;

grant select, insert on table public.jurisdiction_evidence_packets to service_role;
grant select, insert, update on table public.jurisdiction_review_drafts to service_role;
grant select on table public.jurisdiction_rule_packages to service_role;

revoke execute on function public.reject_immutable_jurisdiction_mutation() from public, anon, authenticated, service_role;
revoke execute on function public.guard_jurisdiction_review_lifecycle() from public, anon, authenticated, service_role;
revoke execute on function public.approve_jurisdiction_review_draft(text,bigint,uuid) from public, anon, authenticated;
revoke execute on function public.approve_jurisdiction_review_draft(text,bigint,uuid) from service_role;
grant execute on function public.approve_jurisdiction_review_draft(text,bigint,uuid) to service_role;
;
