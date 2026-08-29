create or replace function public.guard_claim_recovery_settlement_insert()
returns trigger
language plpgsql
set search_path to 'pg_catalog'
as $function$
declare
  v_review public.claim_authority_reviews%rowtype;
  v_onboarding public.claimant_onboarding%rowtype;
  v_quote public.commercial_fee_quotes%rowtype;
  v_package public.claim_filing_packages%rowtype;
  v_expected_fee bigint;
  v_base_fee numeric;
  v_percent_cap bigint;
  v_expected_status text;
begin
  select * into v_review from public.claim_authority_reviews where id = new.authority_review_id;
  if not found then raise exception 'authority review not found for recovery settlement' using errcode='23503'; end if;

  if v_review.status not in ('recovered','closed') or v_review.recovered_at is null or v_review.recovered_amount_cents is null then
    raise exception 'recovery settlement requires a durable recovered authority review' using errcode='42501';
  end if;

  if new.claim_id is distinct from v_review.claim_id
     or new.claim_reference is distinct from v_review.claim_reference
     or new.submission_id is distinct from v_review.submission_id
     or new.filing_package_id is distinct from v_review.filing_package_id
     or new.recovered_at is distinct from v_review.recovered_at
     or new.gross_recovery_cents is distinct from v_review.recovered_amount_cents then
    raise exception 'recovery settlement does not match authority recovery provenance' using errcode='42501';
  end if;

  select * into v_onboarding from public.claimant_onboarding where claim_id = new.claim_id;
  if not found then raise exception 'claimant onboarding not found for recovery settlement' using errcode='23503'; end if;

  if new.commercial_quote_id is distinct from v_onboarding.commercial_quote_id
     or new.fee_agreement_id is distinct from v_onboarding.fee_agreement_id then
    raise exception 'recovery settlement does not match claimant commercial provenance' using errcode='42501';
  end if;

  select * into v_quote from public.commercial_fee_quotes where quote_id = new.commercial_quote_id;
  if not found then raise exception 'commercial quote not found for recovery settlement' using errcode='23503'; end if;

  if v_quote.approval_status <> 'locked' or v_quote.locked_at is null
     or v_quote.snapshot_hash is distinct from v_onboarding.commercial_snapshot_hash then
    raise exception 'recovery settlement requires matching locked commercial provenance' using errcode='42501';
  end if;

  select * into v_package from public.claim_filing_packages where id = new.filing_package_id;
  if not found then raise exception 'filing package not found for recovery settlement' using errcode='23503'; end if;

  if new.payment_route is distinct from nullif(btrim(v_package.snapshot ->> 'paymentRoute'),'')
     or new.launch_payment_track is distinct from nullif(btrim(v_package.snapshot ->> 'launchPaymentTrack'),'')
     or new.representative_may_receive_payment is distinct from nullif(btrim(v_package.snapshot ->> 'representativeMayReceivePayment'),'')
     or new.fee_collection_method is distinct from nullif(btrim(v_package.snapshot ->> 'feeCollectionMethod'),'') then
    raise exception 'recovery settlement does not match frozen payment-route provenance' using errcode='42501';
  end if;

  if new.fee_model is distinct from v_quote.fee_model
     or new.selected_percentage is distinct from v_quote.selected_percentage
     or new.selected_flat_amount_cents is distinct from v_quote.selected_flat_amount_cents
     or new.legal_fee_cap_percent_snapshot is distinct from v_quote.legal_fee_cap_percent_snapshot
     or new.legal_fee_cap_amount_snapshot_cents is distinct from v_quote.legal_fee_cap_amount_snapshot_cents
     or new.internal_fee_cap_amount_snapshot_cents is distinct from v_quote.internal_fee_cap_amount_snapshot_cents then
    raise exception 'recovery settlement fee terms do not match locked quote' using errcode='42501';
  end if;

  if new.gross_recovery_cents = 0 then
    v_expected_fee := 0;
  elsif v_quote.fee_model = 'percentage' then
    if v_quote.selected_percentage is null then raise exception 'percentage fee quote is missing selected percentage' using errcode='42501'; end if;
    v_base_fee := pg_catalog.round(new.gross_recovery_cents::numeric * v_quote.selected_percentage);
    v_expected_fee := v_base_fee::bigint;
  elsif v_quote.fee_model = 'flat' then
    if v_quote.selected_flat_amount_cents is null then raise exception 'flat fee quote is missing selected amount' using errcode='42501'; end if;
    v_expected_fee := v_quote.selected_flat_amount_cents;
  else
    raise exception 'unsupported locked fee model' using errcode='22023';
  end if;

  if v_quote.legal_fee_cap_percent_snapshot is not null then
    v_percent_cap := pg_catalog.round(new.gross_recovery_cents::numeric * v_quote.legal_fee_cap_percent_snapshot)::bigint;
    v_expected_fee := least(v_expected_fee, v_percent_cap);
  end if;

  if v_quote.legal_fee_cap_amount_snapshot_cents is not null then
    v_expected_fee := least(v_expected_fee, v_quote.legal_fee_cap_amount_snapshot_cents);
  end if;

  if v_quote.internal_fee_cap_amount_snapshot_cents is not null then
    v_expected_fee := least(v_expected_fee, v_quote.internal_fee_cap_amount_snapshot_cents);
  end if;

  v_expected_fee := greatest(
    0::bigint,
    least(v_expected_fee, new.gross_recovery_cents)
  );

  v_expected_status := case when v_expected_fee = 0 then 'no_fee_due' else 'awaiting_invoice' end;

  if new.calculated_service_fee_cents is distinct from v_expected_fee
     or new.claimant_economic_net_cents is distinct from new.gross_recovery_cents - v_expected_fee then
    raise exception 'recovery settlement fee calculation does not match locked terms and actual recovery' using errcode='42501';
  end if;

  if new.status is distinct from v_expected_status then
    raise exception 'new recovery settlement has invalid opening status' using errcode='42501';
  end if;

  return new;
end;
$function$;;
