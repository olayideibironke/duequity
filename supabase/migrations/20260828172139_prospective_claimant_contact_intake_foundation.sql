create table public.prospective_claimant_contacts (
  id uuid primary key default gen_random_uuid(),
  discovered_record_id text not null,
  contact_status text not null,
  confirmed_legal_first_name text,
  confirmed_legal_last_name text,
  confirmed_email text,
  confirmed_mobile_phone text,
  property_connection_confirmed_at timestamptz,
  activation_materials_consent_at timestamptz,
  contact_channel text not null default 'phone_call',
  captured_by_staff_user_id uuid not null,
  captured_at timestamptz not null default now(),
  supersedes_contact_id uuid,
  note text,
  created_at timestamptz not null default now(),

  constraint prospective_claimant_contacts_discovered_record_fkey
    foreign key (discovered_record_id)
    references public.discovered_records(id)
    on update restrict
    on delete restrict,

  constraint prospective_claimant_contacts_staff_fkey
    foreign key (captured_by_staff_user_id)
    references public.staff_users(id)
    on update restrict
    on delete restrict,

  constraint prospective_claimant_contacts_supersedes_fkey
    foreign key (supersedes_contact_id)
    references public.prospective_claimant_contacts(id)
    on update restrict
    on delete restrict,

  constraint prospective_claimant_contacts_status_check
    check (contact_status in (
      'interested',
      'callback_requested',
      'declined',
      'do_not_contact'
    )),

  constraint prospective_claimant_contacts_channel_check
    check (contact_channel in (
      'phone_call',
      'inbound_call',
      'in_person',
      'video_call'
    )),

  constraint prospective_claimant_contacts_first_name_check
    check (
      confirmed_legal_first_name is null
      or btrim(confirmed_legal_first_name) <> ''
    ),

  constraint prospective_claimant_contacts_last_name_check
    check (
      confirmed_legal_last_name is null
      or btrim(confirmed_legal_last_name) <> ''
    ),

  constraint prospective_claimant_contacts_email_check
    check (
      confirmed_email is null
      or (
        btrim(confirmed_email) <> ''
        and position('@' in confirmed_email) > 1
      )
    ),

  constraint prospective_claimant_contacts_mobile_check
    check (
      confirmed_mobile_phone is null
      or confirmed_mobile_phone ~ '^[0-9]{10}$'
    ),

  constraint prospective_claimant_contacts_interested_identity_check
    check (
      contact_status <> 'interested'
      or (
        confirmed_legal_first_name is not null
        and confirmed_legal_last_name is not null
        and confirmed_email is not null
      )
    ),

  constraint prospective_claimant_contacts_consent_check
    check (
      activation_materials_consent_at is null
      or confirmed_email is not null
    ),

  constraint prospective_claimant_contacts_note_check
    check (
      note is null
      or btrim(note) <> ''
    )
);

create index prospective_claimant_contacts_record_idx
  on public.prospective_claimant_contacts (
    discovered_record_id,
    captured_at desc
  );

create index prospective_claimant_contacts_status_idx
  on public.prospective_claimant_contacts (
    contact_status,
    captured_at desc
  );

alter table public.prospective_claimant_contacts enable row level security;

revoke all on public.prospective_claimant_contacts
  from public, anon, authenticated;

grant select, insert on public.prospective_claimant_contacts
  to service_role;

create or replace function public.reject_prospective_claimant_contact_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  raise exception 'prospective claimant contact records are immutable; insert a superseding record instead'
    using errcode = '42501';
end;
$$;

create trigger prospective_claimant_contacts_update_guard
before update on public.prospective_claimant_contacts
for each row execute function public.reject_prospective_claimant_contact_mutation();

create trigger prospective_claimant_contacts_delete_guard
before delete on public.prospective_claimant_contacts
for each row execute function public.reject_prospective_claimant_contact_mutation();;
