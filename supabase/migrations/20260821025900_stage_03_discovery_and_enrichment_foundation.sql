create table public.discovered_records (
  id text primary key check (btrim(id) <> ''),
  adapter_key text not null check (btrim(adapter_key) <> ''),
  record_key text not null check (btrim(record_key) <> ''),
  status text not null default 'new' check (status in ('new','reviewed','promoted','dismissed')),
  source_kind text not null check (btrim(source_kind) <> ''),
  source_name text not null check (btrim(source_name) <> ''),
  source_url text not null check (btrim(source_url) <> ''),
  source_reference text,
  former_owner_name text not null check (btrim(former_owner_name) <> ''),
  property_id text,
  address_line1 text not null check (btrim(address_line1) <> ''),
  city text not null,
  county text not null check (btrim(county) <> ''),
  state_code text not null check (state_code ~ '^[A-Z]{2}$'),
  state_fips text check (state_fips is null or state_fips ~ '^[0-9]{2}$'),
  county_geoid text check (county_geoid is null or (county_geoid ~ '^[0-9]{5}$' and (state_fips is null or left(county_geoid,2)=state_fips))),
  postal_code text,
  sale_type text not null check (btrim(sale_type) <> ''),
  sale_date date not null,
  case_number text,
  parcel_number text,
  agency_name text not null check (btrim(agency_name) <> ''),
  agency_phone text,
  custodian text not null check (btrim(custodian) <> ''),
  source_listed_balance_cents bigint check (source_listed_balance_cents is null or source_listed_balance_cents >= 0),
  discovered_at timestamptz not null,
  last_seen_at timestamptz not null,
  source_retrieved_at timestamptz not null,
  reviewed_at timestamptz,
  review_note text,
  promoted_opportunity_id text,
  source_snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(source_snapshot)='object'),
  row_version bigint not null default 1 check (row_version >= 1),
  updated_by_user_id text,
  updated_at timestamptz not null default now(),
  unique (adapter_key, record_key),
  check ((status='promoted' and promoted_opportunity_id is not null and btrim(promoted_opportunity_id)<>'') or (status<>'promoted')),
  check (reviewed_at is null or status in ('reviewed','promoted','dismissed'))
);
comment on table public.discovered_records is 'DueQuity official-source discovery staging. A discovered record never creates a legal rule, approves a jurisdiction, authorizes intake, or converts itself into an opportunity.';
comment on column public.discovered_records.source_snapshot is 'Lossless persisted source payload/provenance snapshot. Migration copies existing payload literally; review workflow must not rewrite it.';

create index discovered_records_status_seen_idx on public.discovered_records(status,last_seen_at desc);
create index discovered_records_geo_idx on public.discovered_records(state_code,county_geoid,sale_type,last_seen_at desc);
create index discovered_records_case_idx on public.discovered_records(case_number) where case_number is not null;

create table public.discovered_record_enrichment (
  id text primary key check (btrim(id) <> ''),
  discovered_record_id text not null unique references public.discovered_records(id) on update restrict on delete restrict,
  enrichment_snapshot jsonb not null check (jsonb_typeof(enrichment_snapshot)='object'),
  provenance_snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(provenance_snapshot)='object'),
  row_version bigint not null default 1 check (row_version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by_user_id text
);
comment on table public.discovered_record_enrichment is 'Lossless DueQuity enrichment snapshot linked 1:1 to a discovered official-source record. Enrichment does not create an opportunity or change jurisdiction/intake authorization.';

create index discovered_record_enrichment_record_idx on public.discovered_record_enrichment(discovered_record_id);

create index jurisdiction_review_approved_package_fk_idx on public.jurisdiction_review_drafts(approved_package_id,approved_package_version) where approved_package_id is not null;
create index jurisdiction_rule_packages_evidence_fk_idx on public.jurisdiction_rule_packages(evidence_packet_id,evidence_packet_hash);

create or replace function public.guard_discovered_record_update()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if new.id is distinct from old.id
     or new.adapter_key is distinct from old.adapter_key
     or new.record_key is distinct from old.record_key
     or new.source_kind is distinct from old.source_kind
     or new.source_name is distinct from old.source_name
     or new.source_url is distinct from old.source_url
     or new.source_reference is distinct from old.source_reference
     or new.former_owner_name is distinct from old.former_owner_name
     or new.property_id is distinct from old.property_id
     or new.address_line1 is distinct from old.address_line1
     or new.city is distinct from old.city
     or new.county is distinct from old.county
     or new.state_code is distinct from old.state_code
     or new.state_fips is distinct from old.state_fips
     or new.county_geoid is distinct from old.county_geoid
     or new.postal_code is distinct from old.postal_code
     or new.sale_type is distinct from old.sale_type
     or new.sale_date is distinct from old.sale_date
     or new.case_number is distinct from old.case_number
     or new.parcel_number is distinct from old.parcel_number
     or new.agency_name is distinct from old.agency_name
     or new.agency_phone is distinct from old.agency_phone
     or new.custodian is distinct from old.custodian
     or new.source_listed_balance_cents is distinct from old.source_listed_balance_cents
     or new.discovered_at is distinct from old.discovered_at
     or new.source_retrieved_at is distinct from old.source_retrieved_at
     or new.source_snapshot is distinct from old.source_snapshot then
    raise exception 'discovered record source identity/provenance is immutable' using errcode='42501';
  end if;
  new.row_version := old.row_version + 1;
  new.updated_at := pg_catalog.clock_timestamp();
  return new;
end;
$$;

create or replace function public.guard_discovered_enrichment_update()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if new.id is distinct from old.id or new.discovered_record_id is distinct from old.discovered_record_id or new.created_at is distinct from old.created_at then
    raise exception 'discovered enrichment identity is immutable' using errcode='42501';
  end if;
  new.row_version := old.row_version + 1;
  new.updated_at := pg_catalog.clock_timestamp();
  return new;
end;
$$;

create trigger discovered_records_guard_update before update on public.discovered_records for each row execute function public.guard_discovered_record_update();
create trigger discovered_enrichment_guard_update before update on public.discovered_record_enrichment for each row execute function public.guard_discovered_enrichment_update();

alter table public.discovered_records enable row level security;
alter table public.discovered_record_enrichment enable row level security;

revoke all privileges on table public.discovered_records from public,anon,authenticated;
revoke all privileges on table public.discovered_record_enrichment from public,anon,authenticated;
revoke all privileges on table public.discovered_records from service_role;
grant select,insert,update on table public.discovered_records to service_role;
revoke delete,truncate on table public.discovered_records from service_role;
revoke all privileges on table public.discovered_record_enrichment from service_role;
grant select,insert,update on table public.discovered_record_enrichment to service_role;
revoke delete,truncate on table public.discovered_record_enrichment from service_role;

revoke execute on function public.guard_discovered_record_update() from public,anon,authenticated,service_role;
revoke execute on function public.guard_discovered_enrichment_update() from public,anon,authenticated,service_role;;
