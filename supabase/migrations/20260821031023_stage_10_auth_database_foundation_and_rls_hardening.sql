alter table public.claimant_onboarding
  add constraint claimant_onboarding_auth_user_fkey
  foreign key (claimant_auth_user_id) references auth.users(id)
  on update cascade on delete set null;

create unique index claimant_onboarding_auth_user_uidx
  on public.claimant_onboarding(claimant_auth_user_id)
  where claimant_auth_user_id is not null;

create or replace function public.guard_claimant_auth_audience_binding()
returns trigger
language plpgsql
set search_path=pg_catalog
as $$
begin
  if new.claimant_auth_user_id is not null then
    if exists(select 1 from public.staff_users where id=new.claimant_auth_user_id) then
      raise exception 'an Auth identity mapped to staff_users cannot be bound as a claimant identity' using errcode='42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger claimant_onboarding_auth_audience_guard
before insert or update of claimant_auth_user_id on public.claimant_onboarding
for each row execute function public.guard_claimant_auth_audience_binding();

comment on column public.claimant_onboarding.claimant_auth_user_id is
  'Supabase Auth UUID for the claimant audience. Server claimant-session resolution must require this mapping; staff-session resolution requires public.staff_users instead. The same currently mapped staff UUID is rejected by the claimant binding guard.';

revoke execute on function public.guard_claimant_auth_audience_binding() from public,anon,authenticated,service_role;

revoke all privileges on all tables in schema public from anon,authenticated;

alter table public.staff_users enable row level security;
alter table public.audit_events enable row level security;
alter table public.jurisdiction_evidence_packets enable row level security;
alter table public.jurisdiction_review_drafts enable row level security;
alter table public.jurisdiction_rule_packages enable row level security;
alter table public.discovered_records enable row level security;
alter table public.discovered_record_enrichment enable row level security;
alter table public.commercial_fee_policies enable row level security;
alter table public.commercial_fee_quotes enable row level security;
alter table public.commercial_fee_quote_audit enable row level security;
alter table public.properties enable row level security;
alter table public.opportunities enable row level security;
alter table public.opportunity_conversions enable row level security;
alter table public.opportunity_conversion_audit enable row level security;
alter table public.claimant_onboarding enable row level security;
alter table public.claimant_onboarding_audit enable row level security;
alter table public.claim_document_requests enable row level security;
alter table public.claim_documents enable row level security;
alter table public.claim_document_audit enable row level security;
alter table public.claim_filing_packages enable row level security;
alter table public.claim_filing_package_audit enable row level security;
alter table public.outreach_attempts enable row level security;;
