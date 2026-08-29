alter table public.prospective_claimant_contacts
  add column record_purpose text not null default 'operational';

alter table public.prospective_claimant_contacts
  add constraint prospective_claimant_contacts_record_purpose_check
    check (record_purpose in ('operational','qa'));

create or replace function public.reject_prospective_claimant_contact_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if tg_op = 'DELETE' and old.record_purpose = 'qa' then
    return old;
  end if;

  raise exception 'operational prospective claimant contact records are immutable; insert a superseding record instead'
    using errcode = '42501';
end;
$$;;
