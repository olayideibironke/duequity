begin;

create table public.jurisdiction_filing_destinations (
  id text primary key
    check (btrim(id) <> ''),

  jurisdiction_package_id text not null,
  jurisdiction_package_version bigint not null
    check (jurisdiction_package_version >= 1),

  jurisdiction_id text not null
    check (btrim(jurisdiction_id) <> ''),

  destination_version bigint not null
    check (destination_version >= 1),

  status text not null
    check (
      status in (
        'verified',
        'superseded'
      )
    ),

  submission_method text not null
    check (
      submission_method in (
        'email',
        'mail',
        'online',
        'in_person',
        'court_e_filing'
      )
    ),

  agency_name text not null
    check (btrim(agency_name) <> ''),

  department_name text null
    check (
      department_name is null
      or btrim(department_name) <> ''
    ),

  attention_line text null
    check (
      attention_line is null
      or btrim(attention_line) <> ''
    ),

  filing_email text null
    check (
      filing_email is null
      or filing_email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    ),

  mailing_address jsonb null
    check (
      mailing_address is null
      or jsonb_typeof(mailing_address) = 'object'
    ),

  physical_address jsonb null
    check (
      physical_address is null
      or jsonb_typeof(physical_address) = 'object'
    ),

  portal_url text null
    check (
      portal_url is null
      or portal_url ~* '^https?://.+'
    ),

  phone text null
    check (
      phone is null
      or btrim(phone) <> ''
    ),

  filing_instructions text[] not null
    default '{}'::text[]
    check (
      array_position(filing_instructions, null) is null
    ),

  official_source_url text not null
    check (
      official_source_url ~* '^https?://.+'
    ),

  official_source_title text null
    check (
      official_source_title is null
      or btrim(official_source_title) <> ''
    ),

  evidence_note text null
    check (
      evidence_note is null
      or btrim(evidence_note) <> ''
    ),

  verified_by_user_id uuid not null
    references public.staff_users(id)
    on update restrict
    on delete restrict,

  verified_at timestamptz not null,

  superseded_at timestamptz null,

  superseded_by_destination_id text null
    references public.jurisdiction_filing_destinations(id)
    on update restrict
    on delete restrict,

  created_at timestamptz not null
    default now(),

  constraint jurisdiction_filing_destinations_package_fk
    foreign key (
      jurisdiction_package_id,
      jurisdiction_package_version
    )
    references public.jurisdiction_rule_packages(
      package_id,
      version
    )
    on update restrict
    on delete restrict,

  constraint jurisdiction_filing_destinations_version_uq
    unique (
      jurisdiction_package_id,
      jurisdiction_package_version,
      submission_method,
      destination_version
    ),

  constraint jurisdiction_filing_destinations_status_state_chk
    check (
      (
        status = 'verified'
        and superseded_at is null
        and superseded_by_destination_id is null
      )
      or
      (
        status = 'superseded'
        and superseded_at is not null
        and superseded_by_destination_id is not null
        and superseded_by_destination_id <> id
      )
    ),

  constraint jurisdiction_filing_destinations_email_route_chk
    check (
      submission_method <> 'email'
      or (
        filing_email is not null
        and btrim(filing_email) <> ''
      )
    ),

  constraint jurisdiction_filing_destinations_online_route_chk
    check (
      submission_method <> 'online'
      or (
        portal_url is not null
        and btrim(portal_url) <> ''
      )
    ),

  constraint jurisdiction_filing_destinations_court_route_chk
    check (
      submission_method <> 'court_e_filing'
      or (
        portal_url is not null
        and btrim(portal_url) <> ''
      )
    ),

  constraint jurisdiction_filing_destinations_mail_route_chk
    check (
      submission_method <> 'mail'
      or (
        mailing_address is not null
        and jsonb_typeof(mailing_address) = 'object'
        and mailing_address ?& array[
          'line1',
          'city',
          'stateCode',
          'postalCode',
          'countryCode'
        ]
        and btrim(mailing_address ->> 'line1') <> ''
        and btrim(mailing_address ->> 'city') <> ''
        and (mailing_address ->> 'stateCode') ~ '^[A-Z]{2}$'
        and (mailing_address ->> 'postalCode')
          ~ '^[0-9]{5}(-[0-9]{4})?$'
        and upper(mailing_address ->> 'countryCode')
          in ('US', 'USA')
      )
    ),

  constraint jurisdiction_filing_destinations_in_person_route_chk
    check (
      submission_method <> 'in_person'
      or (
        physical_address is not null
        and jsonb_typeof(physical_address) = 'object'
        and physical_address ?& array[
          'line1',
          'city',
          'stateCode',
          'postalCode',
          'countryCode'
        ]
        and btrim(physical_address ->> 'line1') <> ''
        and btrim(physical_address ->> 'city') <> ''
        and (physical_address ->> 'stateCode') ~ '^[A-Z]{2}$'
        and (physical_address ->> 'postalCode')
          ~ '^[0-9]{5}(-[0-9]{4})?$'
        and upper(physical_address ->> 'countryCode')
          in ('US', 'USA')
      )
    )
);

create unique index
  jurisdiction_filing_destinations_one_verified_method_uq
on public.jurisdiction_filing_destinations (
  jurisdiction_package_id,
  jurisdiction_package_version,
  submission_method
)
where status = 'verified';

create index
  jurisdiction_filing_destinations_jurisdiction_idx
on public.jurisdiction_filing_destinations (
  jurisdiction_id,
  status,
  submission_method
);

create index
  jurisdiction_filing_destinations_package_idx
on public.jurisdiction_filing_destinations (
  jurisdiction_package_id,
  jurisdiction_package_version,
  status
);

create index
  jurisdiction_filing_destinations_verified_at_idx
on public.jurisdiction_filing_destinations (
  verified_at desc
);

create or replace function
  public.guard_jurisdiction_filing_destination_insert()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
declare
  package_jurisdiction_id text;
begin
  select jurisdiction_id
  into package_jurisdiction_id
  from public.jurisdiction_rule_packages
  where package_id = new.jurisdiction_package_id
    and version = new.jurisdiction_package_version;

  if package_jurisdiction_id is null then
    raise exception
      'Referenced jurisdiction package could not be resolved'
      using errcode = '23503';
  end if;

  if new.jurisdiction_id is distinct from package_jurisdiction_id then
    raise exception
      'Filing destination jurisdiction does not match referenced jurisdiction package'
      using errcode = '23514';
  end if;

  return new;
end;
$function$;

create or replace function
  public.guard_jurisdiction_filing_destination_update()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
begin
  if (
    to_jsonb(new)
      - array[
          'status',
          'superseded_at',
          'superseded_by_destination_id'
        ]
    is distinct from
    to_jsonb(old)
      - array[
          'status',
          'superseded_at',
          'superseded_by_destination_id'
        ]
  ) then
    raise exception
      'Filing destination facts and verification provenance are immutable'
      using errcode = '42501';
  end if;

  if old.status = 'verified' then
    if new.status <> 'superseded' then
      raise exception
        'A verified filing destination may only transition to superseded'
        using errcode = '42501';
    end if;

    if new.superseded_at is null
       or new.superseded_by_destination_id is null then
      raise exception
        'Superseded filing destination requires supersession provenance'
        using errcode = '42501';
    end if;

  elsif old.status = 'superseded' then
    raise exception
      'A superseded filing destination is terminal'
      using errcode = '42501';

  else
    raise exception
      'Invalid filing destination status transition'
      using errcode = '42501';
  end if;

  return new;
end;
$function$;

create or replace function
  public.reject_jurisdiction_filing_destination_delete()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
begin
  raise exception
    'Jurisdiction filing destinations are append-only and cannot be deleted'
    using errcode = '42501';
end;
$function$;

create trigger
  jurisdiction_filing_destinations_insert_guard
before insert
on public.jurisdiction_filing_destinations
for each row
execute function
  public.guard_jurisdiction_filing_destination_insert();

create trigger
  jurisdiction_filing_destinations_update_guard
before update
on public.jurisdiction_filing_destinations
for each row
execute function
  public.guard_jurisdiction_filing_destination_update();

create trigger
  jurisdiction_filing_destinations_delete_guard
before delete
on public.jurisdiction_filing_destinations
for each row
execute function
  public.reject_jurisdiction_filing_destination_delete();

alter table
  public.jurisdiction_filing_destinations
enable row level security;

revoke all
on table public.jurisdiction_filing_destinations
from public;

revoke all
on table public.jurisdiction_filing_destinations
from anon;

revoke all
on table public.jurisdiction_filing_destinations
from authenticated;

grant select, insert, update
on table public.jurisdiction_filing_destinations
to service_role;

revoke all
on function public.guard_jurisdiction_filing_destination_insert()
from public;

revoke all
on function public.guard_jurisdiction_filing_destination_insert()
from anon;

revoke all
on function public.guard_jurisdiction_filing_destination_insert()
from authenticated;

revoke all
on function public.guard_jurisdiction_filing_destination_update()
from public;

revoke all
on function public.guard_jurisdiction_filing_destination_update()
from anon;

revoke all
on function public.guard_jurisdiction_filing_destination_update()
from authenticated;

revoke all
on function public.reject_jurisdiction_filing_destination_delete()
from public;

revoke all
on function public.reject_jurisdiction_filing_destination_delete()
from anon;

revoke all
on function public.reject_jurisdiction_filing_destination_delete()
from authenticated;

commit;