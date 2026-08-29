create table public.claim_document_requests (
  id text primary key check (btrim(id)<>''),
  claim_id text not null references public.claimant_onboarding(claim_id) on update restrict on delete restrict,
  kind text not null check (kind in ('government_id','proof_of_former_ownership','recorded_deed','death_certificate','probate_letters','letters_of_administration','will','trust_instrument','articles_of_organization','certificate_of_good_standing','w9','affidavit_of_heirship','affidavit_of_entitlement','court_order','agency_claim_form','agency_correspondence','fee_agreement','lien_release','bankruptcy_discharge','marriage_certificate','utility_bill_proof_of_residence','other')),
  reason text not null check (btrim(reason)<>''),
  requested_from_claimant_id text,
  requested_at date not null,
  due_by date,
  required boolean not null,
  status text not null check (status in ('outstanding','received','accepted','waived','overdue')),
  guidance text,
  fulfilled_by_document_id text,
  waived_reason text,
  row_version bigint not null default 1 check (row_version>=1),
  updated_at timestamptz not null default now(),
  unique (claim_id,kind),
  check (due_by is null or due_by>=requested_at),
  check ((status='waived' and waived_reason is not null and btrim(waived_reason)<>'') or status<>'waived'),
  check ((status='accepted' and fulfilled_by_document_id is not null and btrim(fulfilled_by_document_id)<>'') or status<>'accepted'),
  check (kind<>'fee_agreement')
);
comment on table public.claim_document_requests is 'Persistent jurisdiction-required document requests. One historical request per claim/kind is reactivated when needed; internal fee_agreement evidence never becomes an agency-required request.';

create index claim_document_requests_claim_status_idx on public.claim_document_requests(claim_id,required,status);

create table public.claim_documents (
  id text primary key check (btrim(id)<>''),
  claim_id text not null references public.claimant_onboarding(claim_id) on update restrict on delete restrict,
  opportunity_id text references public.opportunities(id) on update restrict on delete restrict,
  claimant_id text,
  kind text not null check (kind in ('government_id','proof_of_former_ownership','recorded_deed','death_certificate','probate_letters','letters_of_administration','will','trust_instrument','articles_of_organization','certificate_of_good_standing','w9','affidavit_of_heirship','affidavit_of_entitlement','court_order','agency_claim_form','agency_correspondence','fee_agreement','lien_release','bankruptcy_discharge','marriage_certificate','utility_bill_proof_of_residence','other')),
  title text not null check (btrim(title)<>''),
  original_file_name text,
  mime_type text not null check (mime_type in ('application/pdf','image/jpeg','image/png','image/webp')),
  byte_size bigint not null check (byte_size>0 and byte_size<=15728640),
  sensitivity text not null check (sensitivity in ('public_record','internal','sensitive','restricted')),
  status text not null default 'uploaded' check (status in ('requested','uploaded','scanning','under_review','accepted','rejected','expired','superseded')),
  storage_bucket text not null default 'claim-documents' check (storage_bucket='claim-documents'),
  storage_key text not null unique check (btrim(storage_key)<>''),
  malware_scan_status text not null default 'pending' check (malware_scan_status in ('pending','clean','rejected','unsafe')),
  malware_scanned_at timestamptz,
  malware_scan_detail text,
  uploaded_by_user_id text,
  uploaded_by_claimant_id text,
  uploaded_at timestamptz not null,
  reviewed_by_user_id text,
  reviewed_at timestamptz,
  rejection_reason text,
  page_count integer check (page_count is null or page_count>=1),
  expires_at date,
  row_version bigint not null default 1 check (row_version>=1),
  updated_at timestamptz not null default now(),
  check ((status in ('under_review','accepted')) is false or malware_scan_status='clean'),
  check ((status='accepted' and malware_scan_status='clean' and reviewed_by_user_id is not null and reviewed_at is not null) or status<>'accepted'),
  check ((status='rejected' and rejection_reason is not null and btrim(rejection_reason)<>'' and malware_scan_status in ('clean','rejected','unsafe')) or status<>'rejected'),
  check ((malware_scan_status='pending' and malware_scanned_at is null) or malware_scan_status<>'pending'),
  check ((malware_scan_status in ('clean','rejected','unsafe') and malware_scanned_at is not null) or malware_scan_status='pending')
);
comment on table public.claim_documents is 'Private claimant document metadata. Object bytes live only in the private claim-documents Storage bucket. Pending malware state cannot become reviewable or accepted.';

create index claim_documents_claim_kind_status_idx on public.claim_documents(claim_id,kind,status);
create index claim_documents_opportunity_fk_idx on public.claim_documents(opportunity_id) where opportunity_id is not null;
create index claim_documents_claimant_idx on public.claim_documents(claimant_id) where claimant_id is not null;

alter table public.claim_document_requests
  add constraint claim_document_requests_fulfilled_document_fkey foreign key (fulfilled_by_document_id) references public.claim_documents(id) on update restrict on delete restrict;
create index claim_document_requests_fulfilled_fk_idx on public.claim_document_requests(fulfilled_by_document_id) where fulfilled_by_document_id is not null;

alter table public.claimant_onboarding
  add constraint claimant_onboarding_service_agreement_document_fkey foreign key (service_agreement_document_id) references public.claim_documents(id) on update restrict on delete restrict;
create index claimant_onboarding_service_agreement_document_fk_idx on public.claimant_onboarding(service_agreement_document_id) where service_agreement_document_id is not null;

create table public.claim_document_audit (
  id text primary key check (btrim(id)<>''),
  claim_id text not null references public.claimant_onboarding(claim_id) on update restrict on delete restrict,
  document_id text references public.claim_documents(id) on update restrict on delete restrict,
  request_id text references public.claim_document_requests(id) on update restrict on delete restrict,
  action text not null check (action in ('document_requests_synced','document_uploaded','document_accepted','document_rejected','document_superseded','document_request_waived')),
  actor_user_id text not null check (btrim(actor_user_id)<>''),
  occurred_at timestamptz not null,
  detail text
);
comment on table public.claim_document_audit is 'Append-only claim-document lifecycle audit. Security-sensitive access and material document actions also feed public.audit_events from authorized server paths.';
create index claim_document_audit_claim_idx on public.claim_document_audit(claim_id,occurred_at desc);
create index claim_document_audit_document_fk_idx on public.claim_document_audit(document_id) where document_id is not null;
create index claim_document_audit_request_fk_idx on public.claim_document_audit(request_id) where request_id is not null;

create or replace function public.guard_claim_document_request_update()
returns trigger language plpgsql set search_path=pg_catalog as $$
declare v_doc public.claim_documents%rowtype;
begin
  if new.id is distinct from old.id or new.claim_id is distinct from old.claim_id or new.kind is distinct from old.kind then
    raise exception 'document request identity is immutable; reactivate the existing request' using errcode='42501';
  end if;
  if new.status='accepted' then
    select * into v_doc from public.claim_documents where id=new.fulfilled_by_document_id;
    if not found or v_doc.claim_id<>new.claim_id or v_doc.kind<>new.kind or v_doc.status<>'accepted' or v_doc.malware_scan_status<>'clean' then
      raise exception 'an accepted request must point to a clean accepted document of the same claim and kind' using errcode='42501';
    end if;
  end if;
  new.row_version:=old.row_version+1;
  new.updated_at:=pg_catalog.clock_timestamp();
  return new;
end;$$;

create or replace function public.guard_claim_document_update()
returns trigger language plpgsql set search_path=pg_catalog as $$
begin
  if new.id is distinct from old.id or new.claim_id is distinct from old.claim_id or new.opportunity_id is distinct from old.opportunity_id or new.claimant_id is distinct from old.claimant_id or new.kind is distinct from old.kind or new.mime_type is distinct from old.mime_type or new.byte_size is distinct from old.byte_size or new.storage_bucket is distinct from old.storage_bucket or new.storage_key is distinct from old.storage_key or new.uploaded_by_user_id is distinct from old.uploaded_by_user_id or new.uploaded_by_claimant_id is distinct from old.uploaded_by_claimant_id or new.uploaded_at is distinct from old.uploaded_at then
    raise exception 'uploaded document identity, object metadata, and provenance are immutable' using errcode='42501';
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
end;$$;

create or replace function public.guard_service_agreement_document()
returns trigger language plpgsql set search_path=pg_catalog as $$
declare v_doc public.claim_documents%rowtype;
begin
  if new.service_agreement_signed_at is not null and (old.service_agreement_signed_at is null or new.service_agreement_document_id is distinct from old.service_agreement_document_id) then
    if new.service_agreement_document_id is null then raise exception 'signed service agreement requires an accepted fee_agreement document' using errcode='42501'; end if;
    select * into v_doc from public.claim_documents where id=new.service_agreement_document_id;
    if not found or v_doc.claim_id<>new.claim_id or v_doc.kind<>'fee_agreement' or v_doc.status<>'accepted' or v_doc.malware_scan_status<>'clean' then
      raise exception 'service agreement requires a clean accepted internal fee_agreement document for this claim' using errcode='42501';
    end if;
  end if;
  return new;
end;$$;

create or replace function public.reject_claim_document_audit_mutation()
returns trigger language plpgsql set search_path=pg_catalog as $$ begin raise exception 'claim document audit is append-only' using errcode='42501'; end; $$;

create trigger claim_document_requests_guard_update before update on public.claim_document_requests for each row execute function public.guard_claim_document_request_update();
create trigger claim_documents_guard_update before update on public.claim_documents for each row execute function public.guard_claim_document_update();
create trigger claimant_onboarding_service_agreement_document_guard before insert or update on public.claimant_onboarding for each row execute function public.guard_service_agreement_document();
create trigger claim_document_audit_reject_update_delete before update or delete on public.claim_document_audit for each row execute function public.reject_claim_document_audit_mutation();
create trigger claim_document_audit_reject_truncate before truncate on public.claim_document_audit for each statement execute function public.reject_claim_document_audit_mutation();

alter table public.claim_document_requests enable row level security;
alter table public.claim_documents enable row level security;
alter table public.claim_document_audit enable row level security;
revoke all privileges on table public.claim_document_requests,public.claim_documents,public.claim_document_audit from public,anon,authenticated;
revoke all privileges on table public.claim_document_requests from service_role;
grant select,insert,update on table public.claim_document_requests to service_role;
revoke delete,truncate on table public.claim_document_requests from service_role;
revoke all privileges on table public.claim_documents from service_role;
grant select,insert,update on table public.claim_documents to service_role;
revoke delete,truncate on table public.claim_documents from service_role;
revoke all privileges on table public.claim_document_audit from service_role;
grant select,insert on table public.claim_document_audit to service_role;
revoke update,delete,truncate on table public.claim_document_audit from service_role;

revoke execute on function public.guard_claim_document_request_update() from public,anon,authenticated,service_role;
revoke execute on function public.guard_claim_document_update() from public,anon,authenticated,service_role;
revoke execute on function public.guard_service_agreement_document() from public,anon,authenticated,service_role;
revoke execute on function public.reject_claim_document_audit_mutation() from public,anon,authenticated,service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('claim-documents','claim-documents',false,15728640,array['application/pdf','image/jpeg','image/png','image/webp']::text[]);;
