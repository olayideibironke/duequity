create table if not exists public.operational_record_dispositions (
  record_type text not null check (record_type in ('opportunity','property')),
  record_id text not null,
  purpose text not null check (purpose in ('training','retired_qa')),
  exclude_from_operational_lists boolean not null default true,
  direct_access_allowed boolean not null default false,
  note text,
  created_at timestamptz not null default now(),
  primary key (record_type, record_id)
);

alter table public.operational_record_dispositions enable row level security;

revoke all on table public.operational_record_dispositions from public, anon, authenticated;

grant select, insert, update, delete on table public.operational_record_dispositions to service_role;

insert into public.operational_record_dispositions (
  record_type,
  record_id,
  purpose,
  exclude_from_operational_lists,
  direct_access_allowed,
  note
)
values
  ('opportunity','opportunity-246df9b6575423bfd64533bc','retired_qa',true,false,'Retired pre-launch staff/Super Admin QA chain. Preserve immutable conversion/audit history but exclude from production operations.'),
  ('property','03-009637','retired_qa',true,false,'Property attached only to retired pre-launch staff/Super Admin QA chain.'),
  ('opportunity','opportunity-qa-20260825-02','retired_qa',true,false,'Retired malformed synthetic staff/Super Admin QA fixture. Preserve immutable conversion history but exclude from production operations.'),
  ('property','property-qa-20260825-02','retired_qa',true,false,'Synthetic property attached only to retired QA-02 fixture.'),
  ('opportunity','opportunity-qa-20260825-03','training',true,true,'Preserved claimant training chain. Exclude from production opportunity aggregates while allowing direct training workflow access.'),
  ('property','property-qa-20260825-03','training',true,true,'Synthetic property for preserved claimant training chain. Exclude from production property aggregates while allowing direct training workflow access.')
on conflict (record_type, record_id) do update set
  purpose = excluded.purpose,
  exclude_from_operational_lists = excluded.exclude_from_operational_lists,
  direct_access_allowed = excluded.direct_access_allowed,
  note = excluded.note;;
