alter table public.claim_documents
  add constraint claim_documents_government_id_claimant_provenance_check
  check (
    kind <> 'government_id'
    or (
      claimant_id is not null
      and uploaded_by_claimant_id is not null
      and claimant_id = uploaded_by_claimant_id
    )
  );

create or replace function public.guard_claim_document_update()
returns trigger
language plpgsql
set search_path to 'pg_catalog'
as $function$
begin
  if new.id is distinct from old.id
     or new.claim_id is distinct from old.claim_id
     or new.opportunity_id is distinct from old.opportunity_id
     or new.claimant_id is distinct from old.claimant_id
     or new.kind is distinct from old.kind
     or new.government_id_type is distinct from old.government_id_type
     or new.mime_type is distinct from old.mime_type
     or new.byte_size is distinct from old.byte_size
     or new.storage_bucket is distinct from old.storage_bucket
     or new.storage_key is distinct from old.storage_key
     or new.uploaded_by_user_id is distinct from old.uploaded_by_user_id
     or new.uploaded_by_claimant_id is distinct from old.uploaded_by_claimant_id
     or new.uploaded_at is distinct from old.uploaded_at then
    raise exception 'uploaded document identity, government ID type, object metadata, and provenance are immutable' using errcode='42501';
  end if;

  if old.status in ('rejected','expired','superseded') and new.status is distinct from old.status then
    raise exception 'terminal document state is immutable; upload a new document where necessary' using errcode='42501';
  end if;

  if old.status='accepted' and new.status not in ('accepted','superseded') then
    raise exception 'accepted document may only remain accepted or be superseded' using errcode='42501';
  end if;

  new.row_version:=old.row_version+1;
  new.updated_at:=pg_catalog.clock_timestamp();
  return new;
end;
$function$;;
