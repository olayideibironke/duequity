create or replace function public.guard_required_claimant_government_id_request()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if new.kind = 'government_id' then
    new.required := true;

    if new.status = 'waived' then
      raise exception 'claimant government ID requirement cannot be waived' using errcode='42501';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists claim_document_requests_government_id_guard on public.claim_document_requests;

create trigger claim_document_requests_government_id_guard
before insert or update on public.claim_document_requests
for each row execute function public.guard_required_claimant_government_id_request();

create or replace function public.sync_claimant_identity_from_government_id()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  has_accepted boolean;
begin
  if new.kind <> 'government_id' then
    return new;
  end if;

  if new.status = 'accepted' then
    update public.claimant_onboarding
       set identity_verification = 'verified',
           identity_verified_at = current_date,
           identity_provider_ref = 'duequity-document-review:' || new.id
     where claim_id = new.claim_id;

    update public.claim_document_requests
       set required = true,
           status = 'accepted',
           fulfilled_by_document_id = new.id,
           waived_reason = null,
           row_version = row_version + 1,
           updated_at = pg_catalog.clock_timestamp()
     where claim_id = new.claim_id
       and kind = 'government_id';

    return new;
  end if;

  if new.status in ('uploaded', 'scanning', 'under_review') then
    update public.claimant_onboarding
       set identity_verification = 'under_review',
           identity_verified_at = null,
           identity_provider_ref = null
     where claim_id = new.claim_id
       and identity_verification <> 'verified';

    return new;
  end if;

  if new.status in ('rejected', 'expired', 'superseded') then
    select exists(
      select 1
        from public.claim_documents d
       where d.claim_id = new.claim_id
         and d.kind = 'government_id'
         and d.status = 'accepted'
         and d.id <> new.id
    ) into has_accepted;

    if not has_accepted then
      update public.claimant_onboarding
         set identity_verification = 'documents_requested',
             identity_verified_at = null,
             identity_provider_ref = null
       where claim_id = new.claim_id;

      update public.claim_document_requests
         set required = true,
             status = 'outstanding',
             fulfilled_by_document_id = null,
             waived_reason = null,
             row_version = row_version + 1,
             updated_at = pg_catalog.clock_timestamp()
       where claim_id = new.claim_id
         and kind = 'government_id';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists claim_documents_identity_sync on public.claim_documents;

create trigger claim_documents_identity_sync
after insert or update of status on public.claim_documents
for each row execute function public.sync_claimant_identity_from_government_id();

revoke execute on function public.guard_required_claimant_government_id_request() from public, anon, authenticated;
revoke execute on function public.sync_claimant_identity_from_government_id() from public, anon, authenticated;;
