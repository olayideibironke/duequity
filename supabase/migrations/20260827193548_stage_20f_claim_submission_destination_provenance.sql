begin;

alter table public.claim_submissions
  add column filing_destination_id text not null,

  add column filing_destination_version bigint not null,

  add column filing_destination_snapshot jsonb not null,

  add column filing_destination_snapshot_hash text not null;


alter table public.claim_submissions
  add constraint claim_submissions_filing_destination_fk
    foreign key (filing_destination_id)
    references public.jurisdiction_filing_destinations(id)
    on update restrict
    on delete restrict,

  add constraint claim_submissions_filing_destination_version_chk
    check (filing_destination_version >= 1),

  add constraint claim_submissions_filing_destination_snapshot_chk
    check (
      jsonb_typeof(filing_destination_snapshot) = 'object'
    ),

  add constraint claim_submissions_filing_destination_hash_chk
    check (
      filing_destination_snapshot_hash ~ '^[0-9a-f]{64}$'
    );


create index claim_submissions_filing_destination_idx
  on public.claim_submissions (
    filing_destination_id
  );


create or replace function public.guard_claim_submission_insert()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
declare
  v_package public.claim_filing_packages%rowtype;

  v_destination public.jurisdiction_filing_destinations%rowtype;

  v_representative_may_file text;

  v_destination_snapshot jsonb;

  v_destination_hash text;
begin
  select *
    into v_package
    from public.claim_filing_packages
   where id = new.filing_package_id;

  if not found then
    raise exception
      'filing package not found for claim submission'
      using errcode = '23503';
  end if;

  if v_package.status <> 'pre_filing_approved' then
    raise exception
      'claim submission requires a pre-filing-approved package'
      using errcode = '42501';
  end if;

  if v_package.claim_id is distinct from new.claim_id
     or v_package.claim_reference is distinct from new.claim_reference
     or v_package.version is distinct from new.filing_package_version then
    raise exception
      'claim submission does not match filing-package provenance'
      using errcode = '42501';
  end if;

  if v_package.pre_filing_approved_at is null
     or new.submitted_at < v_package.pre_filing_approved_at then
    raise exception
      'claim submission cannot precede pre-filing approval'
      using errcode = '42501';
  end if;

  v_representative_may_file :=
    v_package.snapshot ->> 'representativeMayFile';

  if v_representative_may_file = 'no' then
    if new.route_mode <> 'claimant_controlled'
       or new.filing_party <> 'claimant' then
      raise exception
        'claimant-controlled filing package cannot record DueQuity or another representative as filer'
        using errcode = '42501';
    end if;
  elsif v_representative_may_file = 'yes' then
    if new.route_mode <> 'representative_controlled'
       or new.filing_party <> 'authorized_representative' then
      raise exception
        'representative-controlled filing package requires authorized representative filing provenance'
        using errcode = '42501';
    end if;
  else
    raise exception
      'filing-party determination is unresolved in the approved package'
      using errcode = '42501';
  end if;

  select *
    into v_destination
    from public.jurisdiction_filing_destinations
   where id = new.filing_destination_id;

  if not found then
    raise exception
      'verified filing destination not found for claim submission'
      using errcode = '23503';
  end if;

  if v_destination.status <> 'verified' then
    raise exception
      'claim submission requires a currently verified filing destination'
      using errcode = '42501';
  end if;

  if v_destination.jurisdiction_package_id
       is distinct from
       v_package.jurisdiction_package_id
     or v_destination.jurisdiction_package_version
       is distinct from
       v_package.jurisdiction_package_version then
    raise exception
      'filing destination does not match the approved filing-package jurisdiction provenance'
      using errcode = '42501';
  end if;

  if v_destination.jurisdiction_id
       is distinct from
       (v_package.snapshot ->> 'jurisdictionId') then
    raise exception
      'filing destination does not match the approved filing-package jurisdiction'
      using errcode = '42501';
  end if;

  if new.submission_method
       is distinct from
       v_destination.submission_method then
    raise exception
      'claim submission method does not match the verified filing destination'
      using errcode = '42501';
  end if;

  v_destination_snapshot :=
    pg_catalog.jsonb_build_object(
      'id', v_destination.id,
      'jurisdictionPackageId', v_destination.jurisdiction_package_id,
      'jurisdictionPackageVersion', v_destination.jurisdiction_package_version,
      'jurisdictionId', v_destination.jurisdiction_id,
      'destinationVersion', v_destination.destination_version,
      'status', v_destination.status,
      'submissionMethod', v_destination.submission_method,
      'agencyName', v_destination.agency_name,
      'departmentName', v_destination.department_name,
      'attentionLine', v_destination.attention_line,
      'filingEmail', v_destination.filing_email,
      'mailingAddress', v_destination.mailing_address,
      'physicalAddress', v_destination.physical_address,
      'portalUrl', v_destination.portal_url,
      'phone', v_destination.phone,
      'filingInstructions', pg_catalog.to_jsonb(v_destination.filing_instructions),
      'officialSourceUrl', v_destination.official_source_url,
      'officialSourceTitle', v_destination.official_source_title,
      'evidenceNote', v_destination.evidence_note,
      'verifiedByUserId', v_destination.verified_by_user_id::text,
      'verifiedAt', v_destination.verified_at,
      'supersededAt', v_destination.superseded_at,
      'supersededByDestinationId', v_destination.superseded_by_destination_id,
      'createdAt', v_destination.created_at
    );

  v_destination_hash :=
    pg_catalog.encode(
      extensions.digest(
        v_destination_snapshot::text,
        'sha256'
      ),
      'hex'
    );

  new.filing_destination_version :=
    v_destination.destination_version;

  new.filing_destination_snapshot :=
    v_destination_snapshot;

  new.filing_destination_snapshot_hash :=
    v_destination_hash;

  return new;
end;
$function$;


create or replace function public.guard_claim_submission_update()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
begin
  if new.id is distinct from old.id
     or new.claim_id is distinct from old.claim_id
     or new.claim_reference is distinct from old.claim_reference
     or new.filing_package_id is distinct from old.filing_package_id
     or new.filing_package_version is distinct from old.filing_package_version
     or new.route_mode is distinct from old.route_mode
     or new.filing_party is distinct from old.filing_party
     or new.authority_name is distinct from old.authority_name
     or new.custodian is distinct from old.custodian
     or new.submission_method is distinct from old.submission_method
     or new.filing_destination_id is distinct from old.filing_destination_id
     or new.filing_destination_version is distinct from old.filing_destination_version
     or new.filing_destination_snapshot is distinct from old.filing_destination_snapshot
     or new.filing_destination_snapshot_hash is distinct from old.filing_destination_snapshot_hash
     or new.submitted_at is distinct from old.submitted_at
     or new.recorded_by_user_id is distinct from old.recorded_by_user_id
     or new.external_reference is distinct from old.external_reference
     or new.submission_note is distinct from old.submission_note
     or new.created_at is distinct from old.created_at then
    raise exception
      'claim submission provenance and original submission facts are immutable'
      using errcode = '42501';
  end if;

  if old.status = 'submitted'
     and new.status not in ('submitted', 'acknowledged') then
    raise exception
      'invalid claim submission transition from submitted'
      using errcode = '42501';
  end if;

  if old.status = 'acknowledged'
     and new.status is distinct from old.status then
    raise exception
      'acknowledged claim submission state is terminal'
      using errcode = '42501';
  end if;

  if new.status = 'submitted' then
    if new.acknowledged_at is not null
       or new.acknowledgment_recorded_by_user_id is not null
       or new.acknowledgment_reference is not null
       or new.acknowledgment_summary is not null then
      raise exception
        'authority acknowledgment fields require acknowledged status'
        using errcode = '42501';
    end if;
  end if;

  if new.status = 'acknowledged' then
    if new.acknowledged_at is null
       or new.acknowledgment_recorded_by_user_id is null
       or pg_catalog.btrim(new.acknowledgment_recorded_by_user_id) = ''
       or new.acknowledged_at < new.submitted_at then
      raise exception
        'authority acknowledgment requires valid chronology and recorder provenance'
        using errcode = '42501';
    end if;
  end if;

  new.row_version := old.row_version + 1;
  new.updated_at := pg_catalog.clock_timestamp();

  return new;
end;
$function$;

commit;