create or replace function public.convert_opportunity_to_claim(
  p_opportunity_id text,
  p_claim_id text,
  p_claim_reference text,
  p_fee_agreement_id text,
  p_actor_user_id uuid,
  p_expected_opportunity_row_version bigint
)
returns table(
  conversion_id text,
  claim_id text,
  claim_reference text,
  converted_at timestamp with time zone
)
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
declare
  v_opp public.opportunities%rowtype;
  v_pkg public.jurisdiction_rule_packages%rowtype;
  v_quote public.commercial_fee_quotes%rowtype;
  v_staff public.staff_users%rowtype;
  v_now timestamptz:=pg_catalog.clock_timestamp();
  v_id text;
  v_new_row_version bigint;
begin
  if p_claim_id is null or btrim(p_claim_id)='' or p_claim_reference is null or btrim(p_claim_reference)='' or p_fee_agreement_id is null or btrim(p_fee_agreement_id)='' then
    raise exception 'claim identity, reference, and fee agreement are required' using errcode='22023';
  end if;

  select * into v_staff from public.staff_users where id=p_actor_user_id and status='active';
  if not found then raise exception 'active staff actor identity not found' using errcode='42501'; end if;

  select * into v_opp from public.opportunities where id=p_opportunity_id for update;
  if not found then raise exception 'opportunity not found' using errcode='P0002'; end if;
  if v_opp.row_version<>p_expected_opportunity_row_version then raise exception 'stale opportunity row version' using errcode='40001'; end if;
  if v_opp.status='converted' or v_opp.converted_claim_id is not null then raise exception 'opportunity is already converted' using errcode='23505'; end if;
  if v_opp.status in ('disqualified','closed') then raise exception 'closed or disqualified opportunity cannot convert' using errcode='42501'; end if;
  if exists (select 1 from pg_catalog.jsonb_array_elements(v_opp.flags) f where f->>'severity'='blocking' and nullif(f->>'resolvedAt','') is null) then
    raise exception 'opportunity has unresolved blocking flags' using errcode='42501';
  end if;
  if v_opp.jurisdiction_package_id is null or v_opp.jurisdiction_package_version is null or v_opp.jurisdiction_legal_rule_version is null then
    raise exception 'opportunity lacks frozen jurisdiction version provenance' using errcode='42501';
  end if;

  select * into v_pkg from public.jurisdiction_rule_packages
   where package_id=v_opp.jurisdiction_package_id and version=v_opp.jurisdiction_package_version;
  if not found then raise exception 'approved jurisdiction package not found' using errcode='42501'; end if;
  if v_pkg.status<>'approved' or not v_pkg.intake_authorized or v_pkg.jurisdiction_id<>v_opp.jurisdiction_id or v_pkg.legal_rule_version<>v_opp.jurisdiction_legal_rule_version or v_pkg.sale_type<>v_opp.sale_type then
    raise exception 'jurisdiction package does not authorize this opportunity for intake' using errcode='42501';
  end if;
  if v_pkg.legal_gate<>'permitted' or v_pkg.claim_submission_gate<>'permitted' or v_pkg.fee_gate<>'permitted' or v_pkg.payment_gate<>'permitted' or not v_pkg.payment_route_ready then
    raise exception 'jurisdiction operational gates are not all permitted' using errcode='42501';
  end if;
  if v_pkg.payment_route in ('unknown','assignee') or v_pkg.payment_launch_track in ('blocked','future_acquisition') or v_pkg.fee_collection_method in ('unknown','assignment_acquisition') then
    raise exception 'Startup Green Lane payment route is blocked' using errcode='42501';
  end if;
  if exists (select 1 from public.jurisdiction_rule_packages newer where newer.jurisdiction_id=v_pkg.jurisdiction_id and newer.sale_type=v_pkg.sale_type and newer.status='approved' and newer.version>v_pkg.version) then
    raise exception 'opportunity jurisdiction snapshot is stale' using errcode='42501';
  end if;

  if v_opp.active_commercial_fee_quote_id is null then raise exception 'approved locked commercial quote is required' using errcode='42501'; end if;
  select * into v_quote from public.commercial_fee_quotes where quote_id=v_opp.active_commercial_fee_quote_id for update;
  if not found then raise exception 'commercial quote not found' using errcode='42501'; end if;
  if v_quote.opportunity_id<>v_opp.id or v_quote.jurisdiction_id<>v_opp.jurisdiction_id or v_quote.viability_status<>'viable' or v_quote.approval_status<>'locked' then
    raise exception 'commercial quote is not viable and locked for this opportunity' using errcode='42501';
  end if;
  if v_quote.legal_rule_version_snapshot is null or v_quote.legal_rule_version_snapshot<>v_pkg.legal_rule_version then
    raise exception 'commercial quote legal-rule snapshot is stale' using errcode='42501';
  end if;
  if v_quote.locked_fee_agreement_id is null or v_quote.locked_fee_agreement_id<>p_fee_agreement_id then
    raise exception 'fee agreement does not match locked commercial quote' using errcode='42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('duequity-conversion:'||v_opp.id),pg_catalog.hashtext(p_claim_id));
  if exists(
    select 1
    from public.opportunity_conversions c
    where c.opportunity_id=v_opp.id
       or c.claim_id=p_claim_id
       or c.claim_reference=p_claim_reference
  ) then
    raise exception 'opportunity or claim conversion already exists' using errcode='23505';
  end if;

  v_id:='conversion-'||v_opp.id;
  insert into public.opportunity_conversions(
    id,opportunity_id,opportunity_reference,jurisdiction_id,jurisdiction_package_id,jurisdiction_package_version,legal_rule_version_snapshot,
    claim_id,claim_reference,commercial_quote_id,commercial_snapshot_hash,commercial_policy_id,commercial_policy_version,fee_agreement_id,status,
    converted_by_user_id,converted_at,created_at,updated_at
  ) values (
    v_id,v_opp.id,v_opp.reference,v_opp.jurisdiction_id,v_pkg.package_id,v_pkg.version,v_pkg.legal_rule_version,
    p_claim_id,p_claim_reference,v_quote.quote_id,v_quote.snapshot_hash,v_quote.commercial_policy_id,v_quote.commercial_policy_version,p_fee_agreement_id,'converted',
    p_actor_user_id::text,v_now,v_now,v_now
  );

  insert into public.opportunity_conversion_audit(id,opportunity_id,claim_id,action,actor_user_id,occurred_at,commercial_quote_id,commercial_snapshot_hash,fee_agreement_id)
  values ('conversion-audit-'||v_opp.id||'-'||p_claim_id,v_opp.id,p_claim_id,'opportunity_converted',p_actor_user_id::text,v_now,v_quote.quote_id,v_quote.snapshot_hash,p_fee_agreement_id);

  update public.opportunities set status='converted',converted_claim_id=p_claim_id,last_activity_on=(v_now at time zone 'UTC')::date where id=v_opp.id returning row_version into v_new_row_version;

  insert into public.audit_events(occurred_at,actor_id,actor_name,actor_role,action,target_type,target_id,target_label,outcome,detail,chain_position,event_hash)
  values (v_now,p_actor_user_id::text,v_staff.name,v_staff.role,'opportunity.converted','opportunity',v_opp.id,v_opp.reference,'success',
    'Converted to claim '||p_claim_reference||' using jurisdiction package '||v_pkg.package_id||' v'||v_pkg.version::text||' and commercial quote '||v_quote.quote_id,
    0,'\\x00'::bytea);

  return query select v_id,p_claim_id,p_claim_reference,v_now;
end;$function$;;
