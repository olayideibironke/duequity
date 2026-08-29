create or replace function public.finalize_claimant_esignature(
  p_envelope_id uuid,
  p_claimant_auth_user_id uuid,
  p_signed_legal_name text,
  p_signature_sha256 text,
  p_final_document_id text,
  p_final_document_sha256 text,
  p_storage_key text,
  p_byte_size bigint,
  p_page_count integer,
  p_signed_at timestamptz,
  p_signature_certificate_snapshot jsonb,
  p_original_file_name text
)
returns jsonb
language plpgsql
security definer
set search_path to pg_catalog, public
as $function$
declare
  v_env public.claimant_agreement_envelopes%rowtype;
  v_onboarding public.claimant_onboarding%rowtype;
  v_signed_date date;
  v_cancel_days integer;
  v_cancel_deadline date;
  v_normalized_expected_name text;
  v_normalized_signed_name text;
begin
  if p_envelope_id is null
     or p_claimant_auth_user_id is null
     or p_signed_legal_name is null
     or btrim(p_signed_legal_name) = ''
     or p_final_document_id is null
     or btrim(p_final_document_id) = ''
     or p_storage_key is null
     or btrim(p_storage_key) = ''
     or p_original_file_name is null
     or btrim(p_original_file_name) = ''
     or p_signed_at is null then
    raise exception 'complete e-signature finalization input is required' using errcode='22023';
  end if;

  if p_signature_sha256 !~ '^[0-9a-f]{64}$'
     or p_final_document_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'signature and final document hashes must be lowercase SHA-256 values' using errcode='22023';
  end if;

  if p_byte_size <= 0 or p_byte_size > 15728640 then
    raise exception 'final agreement PDF size is invalid' using errcode='22023';
  end if;

  if p_page_count is null or p_page_count < 1 then
    raise exception 'final agreement PDF page count is invalid' using errcode='22023';
  end if;

  if p_signature_certificate_snapshot is null
     or jsonb_typeof(p_signature_certificate_snapshot) <> 'object' then
    raise exception 'signature certificate snapshot is required' using errcode='22023';
  end if;

  select *
    into v_env
    from public.claimant_agreement_envelopes
   where id = p_envelope_id
   for update;

  if not found then
    raise exception 'agreement envelope not found' using errcode='P0002';
  end if;

  if v_env.claimant_auth_user_id <> p_claimant_auth_user_id then
    raise exception 'authenticated claimant does not own this agreement envelope' using errcode='42501';
  end if;

  if v_env.status = 'submitted' then
    if v_env.final_document_id = p_final_document_id
       and v_env.final_document_sha256 = p_final_document_sha256
       and v_env.signature_sha256 = p_signature_sha256
       and v_env.signed_by_claimant_auth_user_id = p_claimant_auth_user_id then
      return jsonb_build_object(
        'ok', true,
        'status', 'submitted',
        'claim_id', v_env.claim_id,
        'claimant_id', v_env.claimant_id,
        'final_document_id', v_env.final_document_id,
        'final_document_sha256', v_env.final_document_sha256,
        'signed_at', v_env.signed_at,
        'idempotent', true
      );
    end if;

    raise exception 'submitted agreement evidence does not match this finalization request' using errcode='42501';
  end if;

  if v_env.status <> 'consented' then
    raise exception 'agreement must be in consented status before electronic signature' using errcode='42501';
  end if;

  if v_env.electronic_consent_at is null
     or v_env.electronic_consent_text_snapshot is null
     or v_env.acknowledged_keys_snapshot is null
     or not (v_env.acknowledged_keys_snapshot @> v_env.required_acknowledgement_keys) then
    raise exception 'complete electronic consent evidence is required before signature' using errcode='42501';
  end if;

  if not (v_env.acknowledged_keys_snapshot @> array['free_claim_option_acknowledged']::text[]) then
    raise exception 'free direct-claim option acknowledgement is required before signature' using errcode='42501';
  end if;

  select *
    into v_onboarding
    from public.claimant_onboarding
   where claimant_id = v_env.claimant_id
     and claim_id = v_env.claim_id
   for update;

  if not found then
    raise exception 'claimant onboarding record not found' using errcode='P0002';
  end if;

  if v_onboarding.claimant_auth_user_id is distinct from p_claimant_auth_user_id then
    raise exception 'claimant authentication binding changed before signature' using errcode='42501';
  end if;

  if v_onboarding.identity_verification <> 'verified'
     or v_onboarding.identity_verified_at is null then
    raise exception 'government identity verification must be approved before signing the service agreement' using errcode='42501';
  end if;

  if v_onboarding.jurisdiction_package_id <> v_env.jurisdiction_package_id
     or v_onboarding.jurisdiction_package_version <> v_env.jurisdiction_package_version
     or v_onboarding.legal_rule_version_snapshot <> v_env.jurisdiction_legal_rule_version
     or v_onboarding.commercial_quote_id <> v_env.commercial_quote_id
     or v_onboarding.commercial_snapshot_hash <> v_env.commercial_snapshot_hash
     or v_onboarding.commercial_policy_id <> v_env.commercial_policy_id
     or v_onboarding.commercial_policy_version <> v_env.commercial_policy_version then
    raise exception 'claimant agreement provenance no longer matches onboarding' using errcode='42501';
  end if;

  if v_onboarding.service_agreement_signed_at is not null then
    raise exception 'claimant onboarding already contains an immutable signed service agreement' using errcode='42501';
  end if;

  v_normalized_expected_name := lower(regexp_replace(btrim(v_onboarding.legal_name), '\s+', ' ', 'g'));
  v_normalized_signed_name := lower(regexp_replace(btrim(p_signed_legal_name), '\s+', ' ', 'g'));

  if v_normalized_signed_name <> v_normalized_expected_name then
    raise exception 'typed legal name must match the verified claimant legal name' using errcode='42501';
  end if;

  if exists (
    select 1
      from public.claim_documents
     where id = p_final_document_id
        or storage_key = p_storage_key
  ) then
    raise exception 'final agreement document identity or storage key already exists' using errcode='23505';
  end if;

  v_signed_date := (p_signed_at at time zone 'UTC')::date;

  begin
    v_cancel_days := nullif(v_env.agreement_snapshot #>> '{jurisdiction,cancellationPeriodDays}', '')::integer;
  exception
    when others then
      v_cancel_days := null;
  end;

  if v_cancel_days is not null and v_cancel_days > 0 then
    v_cancel_deadline := v_signed_date + v_cancel_days;
  else
    v_cancel_deadline := null;
  end if;

  insert into public.claim_documents (
    id,
    claim_id,
    opportunity_id,
    claimant_id,
    kind,
    title,
    original_file_name,
    mime_type,
    byte_size,
    sensitivity,
    status,
    storage_bucket,
    storage_key,
    malware_scan_status,
    malware_scanned_at,
    malware_scan_detail,
    uploaded_by_user_id,
    uploaded_by_claimant_id,
    uploaded_at,
    reviewed_by_user_id,
    reviewed_at,
    rejection_reason,
    page_count,
    expires_at,
    government_id_type
  ) values (
    p_final_document_id,
    v_env.claim_id,
    null,
    v_env.claimant_id,
    'fee_agreement',
    'DueQuity Recovery Services Agreement - Signed',
    p_original_file_name,
    'application/pdf',
    p_byte_size,
    'sensitive',
    'accepted',
    'claim-documents',
    p_storage_key,
    'clean',
    p_signed_at,
    'System-generated DueQuity PDF from an immutable agreement snapshot and authenticated claimant e-signature; no external binary upload.',
    null,
    null,
    p_signed_at,
    v_env.issued_by_staff_user_id::text,
    p_signed_at,
    null,
    p_page_count,
    null,
    null
  );

  update public.claimant_agreement_envelopes
     set status = 'submitted',
         signature_method = 'drawn_and_typed',
         signed_by_claimant_auth_user_id = p_claimant_auth_user_id,
         signed_by_claimant_id = v_env.claimant_id,
         signed_legal_name = btrim(p_signed_legal_name),
         signature_sha256 = p_signature_sha256,
         signed_at = p_signed_at,
         submitted_at = p_signed_at,
         final_document_id = p_final_document_id,
         final_document_sha256 = p_final_document_sha256,
         signature_certificate_snapshot = p_signature_certificate_snapshot
   where id = p_envelope_id;

  update public.claimant_onboarding
     set free_claim_option_disclosed_at = coalesce(
           free_claim_option_disclosed_at,
           (v_env.electronic_consent_at at time zone 'UTC')::date
         ),
         fee_agreement_legal_rule_version_snapshot = v_env.jurisdiction_legal_rule_version,
         service_agreement_signed_at = v_signed_date,
         service_agreement_signed_by_claimant_id = v_env.claimant_id,
         service_agreement_required_disclosure_keys_snapshot = v_env.required_acknowledgement_keys,
         service_agreement_cancellation_deadline = v_cancel_deadline,
         service_agreement_document_id = p_final_document_id,
         service_agreement_recorded_by_user_id = v_env.issued_by_staff_user_id::text,
         service_agreement_recorded_at = p_signed_at
   where claimant_id = v_env.claimant_id
     and claim_id = v_env.claim_id;

  insert into public.claimant_agreement_events (
    envelope_id,
    event_type,
    actor_type,
    actor_claimant_auth_user_id,
    occurred_at,
    detail
  ) values
  (
    p_envelope_id,
    'signing_started',
    'claimant',
    p_claimant_auth_user_id,
    p_signed_at,
    jsonb_build_object('signature_method', 'drawn_and_typed')
  ),
  (
    p_envelope_id,
    'signed',
    'claimant',
    p_claimant_auth_user_id,
    p_signed_at,
    jsonb_build_object(
      'signature_sha256', p_signature_sha256,
      'agreement_hash', v_env.agreement_hash,
      'signed_legal_name', btrim(p_signed_legal_name)
    )
  ),
  (
    p_envelope_id,
    'submitted',
    'claimant',
    p_claimant_auth_user_id,
    p_signed_at,
    jsonb_build_object(
      'final_document_id', p_final_document_id,
      'final_document_sha256', p_final_document_sha256
    )
  );

  insert into public.claim_document_audit (
    id,
    claim_id,
    document_id,
    request_id,
    action,
    actor_user_id,
    occurred_at,
    detail
  ) values (
    'claim-doc-audit-esign-' || p_envelope_id::text,
    v_env.claim_id,
    p_final_document_id,
    null,
    'document_accepted',
    p_claimant_auth_user_id::text,
    p_signed_at,
    'System-generated signed DueQuity Recovery Services Agreement accepted at authenticated claimant e-signature finalization.'
  );

  insert into public.claimant_onboarding_audit (
    id,
    claim_id,
    claimant_id,
    action,
    actor_user_id,
    occurred_at,
    detail
  ) values (
    'claimant-onboarding-esign-' || p_envelope_id::text,
    v_env.claim_id,
    v_env.claimant_id,
    'service_agreement_signed',
    p_claimant_auth_user_id::text,
    p_signed_at,
    'DueQuity Recovery Services Agreement electronically signed and automatically filed in the claimant record.'
  );

  return jsonb_build_object(
    'ok', true,
    'status', 'submitted',
    'claim_id', v_env.claim_id,
    'claimant_id', v_env.claimant_id,
    'final_document_id', p_final_document_id,
    'final_document_sha256', p_final_document_sha256,
    'signed_at', p_signed_at,
    'cancellation_deadline', v_cancel_deadline,
    'idempotent', false
  );
end;
$function$;

revoke all on function public.finalize_claimant_esignature(uuid, uuid, text, text, text, text, text, bigint, integer, timestamptz, jsonb, text) from public;
revoke all on function public.finalize_claimant_esignature(uuid, uuid, text, text, text, text, text, bigint, integer, timestamptz, jsonb, text) from anon;
revoke all on function public.finalize_claimant_esignature(uuid, uuid, text, text, text, text, text, bigint, integer, timestamptz, jsonb, text) from authenticated;
grant execute on function public.finalize_claimant_esignature(uuid, uuid, text, text, text, text, text, bigint, integer, timestamptz, jsonb, text) to service_role;;
