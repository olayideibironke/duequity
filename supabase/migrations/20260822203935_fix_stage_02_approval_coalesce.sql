CREATE OR REPLACE FUNCTION public.approve_jurisdiction_review_draft(p_review_id text, p_expected_row_version bigint, p_approver_id uuid)
 RETURNS TABLE(package_id text, package_version bigint, legal_rule_version bigint, intake_authorized boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
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

  select COALESCE(pg_catalog.jsonb_agg(x.elem order by x.ord), '[]'::jsonb)
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

  v_lock_key := v_review.state_fips || ':' || v_review.scope || ':' || COALESCE(v_review.county_geoid, 'STATE') || ':' || v_review.sale_type;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_lock_key, 0::bigint));

  v_package_id := 'jurpkg-' || v_review.state_fips || '-' || COALESCE(v_review.county_geoid, 'state') || '-' || v_review.sale_type;
  v_jurisdiction_id := COALESCE(nullif(btrim(v_review.jurisdiction_id), ''), 'jur-' || lower(v_review.state_code) || '-' || COALESCE(v_review.county_geoid, 'state') || '-' || v_review.sale_type);

  select COALESCE(max(p.version), 0) + 1
    into v_package_version
  from public.jurisdiction_rule_packages p
  where p.package_id = v_package_id;

  select COALESCE(max(p.legal_rule_version), 0) + 1
    into v_legal_rule_version
  from public.jurisdiction_rule_packages p
  where p.jurisdiction_id = v_jurisdiction_id;

  select min(p.created_at)
    into v_created_at
  from public.jurisdiction_rule_packages p
  where p.package_id = v_package_id;
  v_created_at := COALESCE(v_created_at, v_review.created_at);

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
    '\\x00'::bytea
  );

  return query select v_package_id, v_package_version, v_legal_rule_version, v_intake_authorized;
end;
$function$;;
