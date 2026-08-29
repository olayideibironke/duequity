create table public.properties (
  id text primary key check (btrim(id)<>''),
  address_id text,
  address_line1 text not null check (btrim(address_line1)<>''),
  address_line2 text,
  city text not null check (btrim(city)<>''),
  county text not null check (btrim(county)<>''),
  state_code text not null check (state_code ~ '^[A-Z]{2}$'),
  postal_code text not null check (btrim(postal_code)<>''),
  country_code text not null default 'US' check (country_code='US'),
  property_type text not null check (property_type in ('single_family','condominium','townhouse','multi_family','vacant_land','commercial','mixed_use','manufactured')),
  parcel_number text,
  tax_account_number text,
  legal_description text,
  year_built integer check (year_built is null or year_built between 1600 and 2200),
  assessed_value_cents bigint check (assessed_value_cents is null or assessed_value_cents>=0),
  assessed_value_snapshot jsonb,
  provenance jsonb not null check (jsonb_typeof(provenance)='object'),
  property_snapshot jsonb not null check (jsonb_typeof(property_snapshot)='object'),
  row_version bigint not null default 1 check (row_version>=1),
  persisted_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.properties is 'DueQuity production property persistence. Monetary facts use integer cents; source/domain snapshots are preserved for provenance.';

create index properties_state_county_idx on public.properties(state_code,county);
create index properties_parcel_idx on public.properties(parcel_number) where parcel_number is not null;

create table public.opportunities (
  id text primary key check (btrim(id)<>''),
  reference text not null unique check (btrim(reference)<>''),
  property_id text not null references public.properties(id) on update restrict on delete restrict,
  jurisdiction_id text not null check (btrim(jurisdiction_id)<>''),
  jurisdiction_package_id text,
  jurisdiction_package_version bigint check (jurisdiction_package_version is null or jurisdiction_package_version>=1),
  jurisdiction_legal_rule_version bigint check (jurisdiction_legal_rule_version is null or jurisdiction_legal_rule_version>=1),
  sale_type text not null check (btrim(sale_type)<>''),
  sale_date date not null,
  sale_snapshot jsonb not null check (jsonb_typeof(sale_snapshot)='object'),
  prior_owners jsonb not null check (jsonb_typeof(prior_owners)='array'),
  estimated_surplus_cents bigint not null check (estimated_surplus_cents>=0),
  estimated_surplus_snapshot jsonb not null check (jsonb_typeof(estimated_surplus_snapshot)='object'),
  confirmed_surplus_cents bigint check (confirmed_surplus_cents is null or confirmed_surplus_cents>=0),
  confirmed_surplus_snapshot jsonb,
  custodian text not null check (btrim(custodian)<>''),
  claim_deadline date,
  status text not null check (status in ('new','researching','surplus_suspected','surplus_confirmed','owner_research','owner_located','outreach_ready','contact_attempted','contact_established','verification_pending','qualified','converted','disqualified','closed')),
  owner_located text not null check (owner_located in ('not_started','searching','probable_match','located','deceased_heirs_needed','unlocatable')),
  contact_confidence text not null check (contact_confidence in ('none','low','medium','high','confirmed')),
  flags jsonb not null default '[]'::jsonb check (jsonb_typeof(flags)='array'),
  priority smallint not null check (priority between 1 and 3),
  risk_score smallint not null check (risk_score between 0 and 100),
  active_commercial_fee_quote_id text,
  assigned_to_user_id text,
  converted_claim_id text,
  disqualified_reason text check (disqualified_reason is null or disqualified_reason in ('no_surplus','deadline_expired','already_claimed','owner_unlocatable','jurisdiction_restricted','liens_exceed_surplus','claimant_declined','duplicate_record','data_invalid','commercially_unviable')),
  created_on date not null,
  last_activity_on date not null,
  provenance jsonb not null check (jsonb_typeof(provenance)='object'),
  notes jsonb not null default '[]'::jsonb check (jsonb_typeof(notes)='array'),
  row_version bigint not null default 1 check (row_version>=1),
  persisted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (jurisdiction_package_id,jurisdiction_package_version) references public.jurisdiction_rule_packages(package_id,version) on update restrict on delete restrict,
  foreign key (active_commercial_fee_quote_id) references public.commercial_fee_quotes(quote_id) on update restrict on delete restrict,
  check ((jurisdiction_package_id is null and jurisdiction_package_version is null and jurisdiction_legal_rule_version is null) or (jurisdiction_package_id is not null and jurisdiction_package_version is not null and jurisdiction_legal_rule_version is not null)),
  check ((status='converted' and converted_claim_id is not null and btrim(converted_claim_id)<>'') or status<>'converted'),
  check ((status='disqualified' and disqualified_reason is not null) or status<>'disqualified')
);
comment on table public.opportunities is 'DueQuity researched opportunities. Legal and commercial authorization remains external authoritative state; an opportunity cannot convert itself and never promises recovery.';

create index opportunities_property_fk_idx on public.opportunities(property_id);
create index opportunities_jurisdiction_pkg_fk_idx on public.opportunities(jurisdiction_package_id,jurisdiction_package_version) where jurisdiction_package_id is not null;
create index opportunities_status_activity_idx on public.opportunities(status,last_activity_on desc);
create index opportunities_jurisdiction_idx on public.opportunities(jurisdiction_id,sale_type,status);
create index opportunities_active_quote_fk_idx on public.opportunities(active_commercial_fee_quote_id) where active_commercial_fee_quote_id is not null;

alter table public.commercial_fee_quotes
  add constraint commercial_fee_quotes_opportunity_fkey foreign key (opportunity_id) references public.opportunities(id) on update restrict on delete restrict;

create table public.opportunity_conversions (
  id text primary key check (btrim(id)<>''),
  opportunity_id text not null unique references public.opportunities(id) on update restrict on delete restrict,
  opportunity_reference text not null check (btrim(opportunity_reference)<>''),
  jurisdiction_id text not null check (btrim(jurisdiction_id)<>''),
  jurisdiction_package_id text not null,
  jurisdiction_package_version bigint not null check (jurisdiction_package_version>=1),
  legal_rule_version_snapshot bigint not null check (legal_rule_version_snapshot>=1),
  claim_id text not null unique check (btrim(claim_id)<>''),
  claim_reference text not null unique check (btrim(claim_reference)<>''),
  commercial_quote_id text not null references public.commercial_fee_quotes(quote_id) on update restrict on delete restrict,
  commercial_snapshot_hash text not null check (commercial_snapshot_hash ~ '^[0-9a-f]{64}$'),
  commercial_policy_id text not null,
  commercial_policy_version bigint not null check (commercial_policy_version>=1),
  fee_agreement_id text not null check (btrim(fee_agreement_id)<>''),
  status text not null default 'converted' check (status='converted'),
  converted_by_user_id text not null check (btrim(converted_by_user_id)<>''),
  converted_at timestamptz not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  foreign key (jurisdiction_package_id,jurisdiction_package_version) references public.jurisdiction_rule_packages(package_id,version) on update restrict on delete restrict,
  foreign key (commercial_policy_id,commercial_policy_version) references public.commercial_fee_policies(id,version) on update restrict on delete restrict
);
comment on table public.opportunity_conversions is 'Immutable conversion provenance. Conversion is possible only through the controlled server function after current jurisdiction, Green Lane, commercial quote, and agreement gates pass.';

create index opportunity_conversions_jurisdiction_pkg_fk_idx on public.opportunity_conversions(jurisdiction_package_id,jurisdiction_package_version);
create index opportunity_conversions_quote_fk_idx on public.opportunity_conversions(commercial_quote_id);
create index opportunity_conversions_policy_fk_idx on public.opportunity_conversions(commercial_policy_id,commercial_policy_version);

create table public.opportunity_conversion_audit (
  id text primary key check (btrim(id)<>''),
  opportunity_id text not null references public.opportunities(id) on update restrict on delete restrict,
  claim_id text not null check (btrim(claim_id)<>''),
  action text not null check (action='opportunity_converted'),
  actor_user_id text not null check (btrim(actor_user_id)<>''),
  occurred_at timestamptz not null,
  commercial_quote_id text not null references public.commercial_fee_quotes(quote_id) on update restrict on delete restrict,
  commercial_snapshot_hash text not null check (commercial_snapshot_hash ~ '^[0-9a-f]{64}$'),
  fee_agreement_id text not null check (btrim(fee_agreement_id)<>'')
);
comment on table public.opportunity_conversion_audit is 'Append-only opportunity conversion audit. Conversion also appends to the Stage 1 unified immutable audit chain.';

create index opportunity_conversion_audit_opportunity_idx on public.opportunity_conversion_audit(opportunity_id,occurred_at desc);
create index opportunity_conversion_audit_quote_fk_idx on public.opportunity_conversion_audit(commercial_quote_id);

create or replace function public.guard_property_update()
returns trigger language plpgsql set search_path=pg_catalog as $$
begin
  if new.id is distinct from old.id or new.persisted_at is distinct from old.persisted_at then
    raise exception 'property identity is immutable' using errcode='42501';
  end if;
  new.row_version:=old.row_version+1;
  new.updated_at:=pg_catalog.clock_timestamp();
  return new;
end;$$;

create or replace function public.guard_opportunity_update()
returns trigger language plpgsql set search_path=pg_catalog as $$
begin
  if new.id is distinct from old.id or new.reference is distinct from old.reference or new.property_id is distinct from old.property_id or new.persisted_at is distinct from old.persisted_at then
    raise exception 'opportunity identity is immutable' using errcode='42501';
  end if;
  if current_user <> 'postgres' and (new.status='converted' or new.converted_claim_id is not null) and (old.status is distinct from 'converted' or old.converted_claim_id is distinct from new.converted_claim_id) then
    raise exception 'opportunity conversion may occur only through the controlled conversion function' using errcode='42501';
  end if;
  new.row_version:=old.row_version+1;
  new.updated_at:=pg_catalog.clock_timestamp();
  return new;
end;$$;

create or replace function public.reject_immutable_conversion_mutation()
returns trigger language plpgsql set search_path=pg_catalog as $$ begin raise exception 'opportunity conversion history is immutable' using errcode='42501'; end; $$;

create trigger properties_guard_update before update on public.properties for each row execute function public.guard_property_update();
create trigger opportunities_guard_update before update on public.opportunities for each row execute function public.guard_opportunity_update();
create trigger opportunity_conversions_reject_update_delete before update or delete on public.opportunity_conversions for each row execute function public.reject_immutable_conversion_mutation();
create trigger opportunity_conversions_reject_truncate before truncate on public.opportunity_conversions for each statement execute function public.reject_immutable_conversion_mutation();
create trigger opportunity_conversion_audit_reject_update_delete before update or delete on public.opportunity_conversion_audit for each row execute function public.reject_immutable_conversion_mutation();
create trigger opportunity_conversion_audit_reject_truncate before truncate on public.opportunity_conversion_audit for each statement execute function public.reject_immutable_conversion_mutation();

create or replace function public.convert_opportunity_to_claim(
  p_opportunity_id text,
  p_claim_id text,
  p_claim_reference text,
  p_fee_agreement_id text,
  p_actor_user_id uuid,
  p_expected_opportunity_row_version bigint
)
returns table(conversion_id text,claim_id text,claim_reference text,converted_at timestamptz)
language plpgsql security definer set search_path=pg_catalog as $$
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
  if exists(select 1 from public.opportunity_conversions where opportunity_id=v_opp.id or claim_id=p_claim_id or claim_reference=p_claim_reference) then
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
end;$$;

alter table public.properties enable row level security;
alter table public.opportunities enable row level security;
alter table public.opportunity_conversions enable row level security;
alter table public.opportunity_conversion_audit enable row level security;

revoke all privileges on table public.properties,public.opportunities,public.opportunity_conversions,public.opportunity_conversion_audit from public,anon,authenticated;
revoke all privileges on table public.properties from service_role;
grant select,insert,update on table public.properties to service_role;
revoke delete,truncate on table public.properties from service_role;
revoke all privileges on table public.opportunities from service_role;
grant select,insert,update on table public.opportunities to service_role;
revoke delete,truncate on table public.opportunities from service_role;
revoke all privileges on table public.opportunity_conversions from service_role;
grant select on table public.opportunity_conversions to service_role;
revoke insert,update,delete,truncate on table public.opportunity_conversions from service_role;
revoke all privileges on table public.opportunity_conversion_audit from service_role;
grant select on table public.opportunity_conversion_audit to service_role;
revoke insert,update,delete,truncate on table public.opportunity_conversion_audit from service_role;

revoke execute on function public.guard_property_update() from public,anon,authenticated,service_role;
revoke execute on function public.guard_opportunity_update() from public,anon,authenticated,service_role;
revoke execute on function public.reject_immutable_conversion_mutation() from public,anon,authenticated,service_role;
revoke execute on function public.convert_opportunity_to_claim(text,text,text,text,uuid,bigint) from public,anon,authenticated;
grant execute on function public.convert_opportunity_to_claim(text,text,text,text,uuid,bigint) to service_role;;
