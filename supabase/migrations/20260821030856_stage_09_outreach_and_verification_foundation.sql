create table public.outreach_attempts (
  id text primary key check (btrim(id)<>''),
  opportunity_id text not null references public.opportunities(id) on update restrict on delete restrict,
  discovered_record_id text references public.discovered_records(id) on update restrict on delete restrict,
  target_claimant_id text,
  target_former_owner_name text not null check (btrim(target_former_owner_name)<>''),
  target_contact_snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(target_contact_snapshot)='object'),
  channel text not null check (channel in ('letter','email','phone','sms','attorney_letter')),
  template_key text not null check (btrim(template_key)<>''),
  status text not null default 'queued' check (status in ('queued','sent','delivered','returned_undeliverable','responded','opted_out','no_response')),
  sent_at date,
  responded_at date,
  opted_out_at date,
  consent_basis text not null check (consent_basis in ('public_record_mail','express_written','express_oral','inbound_request')),
  do_not_contact_screened_at date,
  verification_code text not null unique check (btrim(verification_code)<>''),
  verification_issued_at timestamptz not null,
  verification_status text not null default 'unused' check (verification_status in ('unused','verified','revoked')),
  verification_used_at timestamptz,
  commercial_fee_quote_id text not null references public.commercial_fee_quotes(quote_id) on update restrict on delete restrict,
  jurisdiction_package_id text not null,
  jurisdiction_package_version bigint not null check (jurisdiction_package_version>=1),
  legal_rule_version_snapshot bigint not null check (legal_rule_version_snapshot>=1),
  outreach_approved_by_user_id text not null check (btrim(outreach_approved_by_user_id)<>''),
  outreach_approved_at timestamptz not null,
  sent_by_user_id text not null check (btrim(sent_by_user_id)<>''),
  follow_up_at date,
  outcome_note text,
  row_version bigint not null default 1 check (row_version>=1),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  foreign key (jurisdiction_package_id,jurisdiction_package_version) references public.jurisdiction_rule_packages(package_id,version) on update restrict on delete restrict,
  check (channel not in ('phone','sms') or do_not_contact_screened_at is not null),
  check (channel not in ('phone','sms') or consent_basis in ('express_written','express_oral','inbound_request')),
  check (consent_basis<>'public_record_mail' or channel in ('letter','attorney_letter')),
  check ((verification_status='verified' and verification_used_at is not null) or verification_status<>'verified'),
  check ((verification_status='unused' and verification_used_at is null) or verification_status<>'unused'),
  check (responded_at is null or sent_at is not null),
  check (opted_out_at is null or sent_at is not null)
);
comment on table public.outreach_attempts is 'Immutable-identity proof-first outreach attempts. Production insertion is available only through the controlled server function after approved jurisdiction/commercial gates. No message transport is implemented by this table.';

create index outreach_attempts_opportunity_idx on public.outreach_attempts(opportunity_id,created_at desc);
create index outreach_attempts_discovered_record_fk_idx on public.outreach_attempts(discovered_record_id) where discovered_record_id is not null;
create index outreach_attempts_quote_fk_idx on public.outreach_attempts(commercial_fee_quote_id);
create index outreach_attempts_jurisdiction_fk_idx on public.outreach_attempts(jurisdiction_package_id,jurisdiction_package_version);
create index outreach_attempts_status_followup_idx on public.outreach_attempts(status,follow_up_at) where follow_up_at is not null;

create or replace function public.guard_outreach_attempt_update()
returns trigger
language plpgsql
set search_path=pg_catalog
as $$
begin
  if new.id is distinct from old.id
     or new.opportunity_id is distinct from old.opportunity_id
     or new.discovered_record_id is distinct from old.discovered_record_id
     or new.target_claimant_id is distinct from old.target_claimant_id
     or new.target_former_owner_name is distinct from old.target_former_owner_name
     or new.target_contact_snapshot is distinct from old.target_contact_snapshot
     or new.channel is distinct from old.channel
     or new.template_key is distinct from old.template_key
     or new.consent_basis is distinct from old.consent_basis
     or new.do_not_contact_screened_at is distinct from old.do_not_contact_screened_at
     or new.verification_code is distinct from old.verification_code
     or new.verification_issued_at is distinct from old.verification_issued_at
     or new.commercial_fee_quote_id is distinct from old.commercial_fee_quote_id
     or new.jurisdiction_package_id is distinct from old.jurisdiction_package_id
     or new.jurisdiction_package_version is distinct from old.jurisdiction_package_version
     or new.legal_rule_version_snapshot is distinct from old.legal_rule_version_snapshot
     or new.outreach_approved_by_user_id is distinct from old.outreach_approved_by_user_id
     or new.outreach_approved_at is distinct from old.outreach_approved_at
     or new.sent_by_user_id is distinct from old.sent_by_user_id
     or new.created_at is distinct from old.created_at then
    raise exception 'outreach identity, compliance basis, verification issuance, and approval provenance are immutable' using errcode='42501';
  end if;

  if old.verification_status in ('verified','revoked') and new.verification_status is distinct from old.verification_status then
    raise exception 'terminal outreach verification state is immutable' using errcode='42501';
  end if;
  if old.status='opted_out' and new.status is distinct from old.status then
    raise exception 'opted-out outreach state is terminal' using errcode='42501';
  end if;

  new.row_version:=old.row_version+1;
  new.updated_at:=pg_catalog.clock_timestamp();
  return new;
end;
$$;

create trigger outreach_attempts_guard_update
before update on public.outreach_attempts
for each row execute function public.guard_outreach_attempt_update();

create or replace function public.create_outreach_attempt(
  p_opportunity_id text,
  p_channel text,
  p_template_key text,
  p_consent_basis text,
  p_target_former_owner_name text,
  p_target_claimant_id text,
  p_target_contact_snapshot jsonb,
  p_discovered_record_id text,
  p_actor_user_id uuid,
  p_do_not_contact_screened_at date,
  p_follow_up_at date
)
returns table(outreach_id text,verification_code text,issued_at timestamptz)
language plpgsql
security definer
set search_path=pg_catalog
as $$
declare
  v_opp public.opportunities%rowtype;
  v_pkg public.jurisdiction_rule_packages%rowtype;
  v_quote public.commercial_fee_quotes%rowtype;
  v_staff public.staff_users%rowtype;
  v_now timestamptz:=pg_catalog.clock_timestamp();
  v_id text;
  v_code text;
begin
  if p_channel not in ('letter','email','phone','sms','attorney_letter') then
    raise exception 'unsupported outreach channel' using errcode='22023';
  end if;
  if p_consent_basis not in ('public_record_mail','express_written','express_oral','inbound_request') then
    raise exception 'unsupported outreach consent basis' using errcode='22023';
  end if;
  if p_template_key is null or btrim(p_template_key)='' or p_target_former_owner_name is null or btrim(p_target_former_owner_name)='' then
    raise exception 'outreach template and former-owner target provenance are required' using errcode='22023';
  end if;
  if p_channel in ('phone','sms') and p_do_not_contact_screened_at is null then
    raise exception 'phone/SMS outreach requires national/state do-not-contact screening' using errcode='42501';
  end if;
  if p_channel in ('phone','sms') and p_consent_basis not in ('express_written','express_oral','inbound_request') then
    raise exception 'phone/SMS outreach requires an express or inbound consent basis' using errcode='42501';
  end if;
  if p_consent_basis='public_record_mail' and p_channel not in ('letter','attorney_letter') then
    raise exception 'public_record_mail basis is limited to mail outreach' using errcode='42501';
  end if;

  select * into v_staff from public.staff_users where id=p_actor_user_id and status='active';
  if not found then raise exception 'active staff actor identity not found' using errcode='42501'; end if;

  select * into v_opp from public.opportunities where id=p_opportunity_id for update;
  if not found then raise exception 'opportunity not found' using errcode='P0002'; end if;
  if v_opp.status not in ('outreach_ready','contact_attempted','contact_established','verification_pending') then
    raise exception 'opportunity is not in an outreach-capable workflow state' using errcode='42501';
  end if;
  if exists (select 1 from pg_catalog.jsonb_array_elements(v_opp.flags) f where f->>'severity'='blocking' and nullif(f->>'resolvedAt','') is null) then
    raise exception 'opportunity has unresolved blocking flags' using errcode='42501';
  end if;
  if v_opp.jurisdiction_package_id is null or v_opp.jurisdiction_package_version is null or v_opp.jurisdiction_legal_rule_version is null then
    raise exception 'opportunity lacks frozen jurisdiction provenance' using errcode='42501';
  end if;

  select * into v_pkg from public.jurisdiction_rule_packages
   where package_id=v_opp.jurisdiction_package_id and version=v_opp.jurisdiction_package_version;
  if not found or v_pkg.status<>'approved' or not v_pkg.intake_authorized then
    raise exception 'approved intake-authorized jurisdiction package is required' using errcode='42501';
  end if;
  if v_pkg.jurisdiction_id<>v_opp.jurisdiction_id or v_pkg.legal_rule_version<>v_opp.jurisdiction_legal_rule_version or v_pkg.sale_type<>v_opp.sale_type then
    raise exception 'opportunity jurisdiction provenance does not match the approved package' using errcode='42501';
  end if;
  if v_pkg.legal_gate<>'permitted' or v_pkg.claim_submission_gate<>'permitted' or v_pkg.fee_gate<>'permitted' or v_pkg.payment_gate<>'permitted' or not v_pkg.payment_route_ready then
    raise exception 'jurisdiction operational gates are not all permitted' using errcode='42501';
  end if;
  if v_pkg.payment_route in ('unknown','assignee') or v_pkg.payment_launch_track in ('blocked','future_acquisition') or v_pkg.fee_collection_method in ('unknown','assignment_acquisition') then
    raise exception 'Startup Green Lane payment route is blocked' using errcode='42501';
  end if;
  if exists (select 1 from public.jurisdiction_rule_packages newer where newer.jurisdiction_id=v_pkg.jurisdiction_id and newer.sale_type=v_pkg.sale_type and newer.status='approved' and newer.version>v_pkg.version) then
    raise exception 'opportunity jurisdiction package is stale' using errcode='42501';
  end if;

  if v_opp.active_commercial_fee_quote_id is null then
    raise exception 'approved commercial quote is required before outreach' using errcode='42501';
  end if;
  select * into v_quote from public.commercial_fee_quotes where quote_id=v_opp.active_commercial_fee_quote_id;
  if not found or v_quote.opportunity_id<>v_opp.id or v_quote.jurisdiction_id<>v_opp.jurisdiction_id or v_quote.viability_status<>'viable' or v_quote.approval_status not in ('staff_approved','manager_approved','locked') then
    raise exception 'commercial pricing gate has not passed for outreach' using errcode='42501';
  end if;
  if v_quote.legal_rule_version_snapshot is null or v_quote.legal_rule_version_snapshot<>v_pkg.legal_rule_version then
    raise exception 'commercial quote legal-rule snapshot is stale' using errcode='42501';
  end if;

  if p_discovered_record_id is not null and not exists(select 1 from public.discovered_records where id=p_discovered_record_id) then
    raise exception 'linked discovered record does not exist' using errcode='23503';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('duequity-outreach:'||v_opp.id),0);
  v_id:='outreach-'||extensions.gen_random_uuid()::text;
  v_code:=upper(substr(replace(extensions.gen_random_uuid()::text,'-',''),1,12));

  insert into public.outreach_attempts(
    id,opportunity_id,discovered_record_id,target_claimant_id,target_former_owner_name,target_contact_snapshot,
    channel,template_key,status,consent_basis,do_not_contact_screened_at,verification_code,verification_issued_at,
    verification_status,commercial_fee_quote_id,jurisdiction_package_id,jurisdiction_package_version,legal_rule_version_snapshot,
    outreach_approved_by_user_id,outreach_approved_at,sent_by_user_id,follow_up_at,created_at,updated_at
  ) values (
    v_id,v_opp.id,p_discovered_record_id,nullif(btrim(p_target_claimant_id),''),btrim(p_target_former_owner_name),coalesce(p_target_contact_snapshot,'{}'::jsonb),
    p_channel,btrim(p_template_key),'queued',p_consent_basis,p_do_not_contact_screened_at,v_code,v_now,
    'unused',v_quote.quote_id,v_pkg.package_id,v_pkg.version,v_pkg.legal_rule_version,
    p_actor_user_id::text,v_now,p_actor_user_id::text,p_follow_up_at,v_now,v_now
  );

  insert into public.audit_events(occurred_at,actor_id,actor_name,actor_role,action,target_type,target_id,target_label,outcome,detail,chain_position,event_hash)
  values(v_now,p_actor_user_id::text,v_staff.name,v_staff.role,'outreach.created','opportunity',v_opp.id,v_opp.reference,'success',
    'Created '||p_channel||' outreach attempt '||v_id||' after jurisdiction and commercial gates passed.',0,'\\x00'::bytea);

  return query select v_id,v_code,v_now;
end;
$$;

alter table public.outreach_attempts enable row level security;
revoke all privileges on table public.outreach_attempts from public,anon,authenticated;
revoke all privileges on table public.outreach_attempts from service_role;
grant select,update on table public.outreach_attempts to service_role;
revoke insert,delete,truncate on table public.outreach_attempts from service_role;

revoke execute on function public.guard_outreach_attempt_update() from public,anon,authenticated,service_role;
revoke execute on function public.create_outreach_attempt(text,text,text,text,text,text,jsonb,text,uuid,date,date) from public,anon,authenticated;
grant execute on function public.create_outreach_attempt(text,text,text,text,text,text,jsonb,text,uuid,date,date) to service_role;;
