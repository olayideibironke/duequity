create or replace function public.bootstrap_claim_recovery_settlement_from_authority_review()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
declare
  v_onboarding public.claimant_onboarding%rowtype;
  v_quote public.commercial_fee_quotes%rowtype;
  v_package public.claim_filing_packages%rowtype;
  v_base_fee numeric;
  v_fee bigint;
  v_legal_percent_cap bigint;
  v_payment_route text;
  v_launch_payment_track text;
  v_representative_may_receive text;
  v_fee_collection_method text;
  v_status text;
  v_settlement_id text;
begin
  if not (old.status = 'payment_issued' and new.status = 'recovered') then
    return new;
  end if;

  select * into v_onboarding
  from public.claimant_onboarding
  where claim_id = new.claim_id;

  if not found then
    raise exception 'claimant onboarding not found for recovered claim'
      using errcode = '23503';
  end if;

  select * into v_quote
  from public.commercial_fee_quotes
  where quote_id = v_onboarding.commercial_quote_id;

  if not found then
    raise exception 'locked commercial quote not found for recovered claim'
      using errcode = '23503';
  end if;

  if v_quote.approval_status <> 'locked' or v_quote.locked_at is null then
    raise exception 'recovery settlement requires a locked commercial quote'
      using errcode = '42501';
  end if;

  if v_quote.snapshot_hash is distinct from v_onboarding.commercial_snapshot_hash then
    raise exception 'recovery settlement commercial snapshot provenance mismatch'
      using errcode = '42501';
  end if;

  select * into v_package
  from public.claim_filing_packages
  where id = new.filing_package_id;

  if not found then
    raise exception 'filing package not found for recovery settlement'
      using errcode = '23503';
  end if;

  v_payment_route := nullif(btrim(v_package.snapshot ->> 'paymentRoute'), '');
  v_launch_payment_track := nullif(btrim(v_package.snapshot ->> 'launchPaymentTrack'), '');
  v_representative_may_receive := nullif(btrim(v_package.snapshot ->> 'representativeMayReceivePayment'), '');
  v_fee_collection_method := nullif(btrim(v_package.snapshot ->> 'feeCollectionMethod'), '');

  if v_payment_route is null
     or v_launch_payment_track is null
     or v_representative_may_receive not in ('yes','no')
     or v_fee_collection_method is null then
    raise exception 'recovery settlement payment-route provenance is incomplete'
      using errcode = '42501';
  end if;

  if new.recovered_amount_cents is null or new.recovered_at is null then
    raise exception 'authority recovery amount and timestamp are required'
      using errcode = '42501';
  end if;

  if new.recovered_amount_cents = 0 then
    v_fee := 0;
  elsif v_quote.fee_model = 'percentage' then
    if v_quote.selected_percentage is null then
      raise exception 'percentage fee quote is missing selected percentage'
        using errcode = '42501';
    end if;

    v_base_fee := pg_catalog.round(
      new.recovered_amount_cents::numeric * v_quote.selected_percentage
    );

    v_fee := v_base_fee::bigint;
  elsif v_quote.fee_model = 'flat' then
    if v_quote.selected_flat_amount_cents is null then
      raise exception 'flat fee quote is missing selected amount'
        using errcode = '42501';
    end if;

    v_fee := v_quote.selected_flat_amount_cents;
  else
    raise exception 'unsupported locked fee model for recovery settlement: %', v_quote.fee_model
      using errcode = '22023';
  end if;

  if v_quote.legal_fee_cap_percent_snapshot is not null then
    v_legal_percent_cap := pg_catalog.round(
      new.recovered_amount_cents::numeric * v_quote.legal_fee_cap_percent_snapshot
    )::bigint;

    v_fee := least(v_fee, v_legal_percent_cap);
  end if;

  if v_quote.legal_fee_cap_amount_snapshot_cents is not null then
    v_fee := least(v_fee, v_quote.legal_fee_cap_amount_snapshot_cents);
  end if;

  if v_quote.internal_fee_cap_amount_snapshot_cents is not null then
    v_fee := least(v_fee, v_quote.internal_fee_cap_amount_snapshot_cents);
  end if;

  v_fee := greatest(
    0::bigint,
    least(v_fee, new.recovered_amount_cents)
  );

  v_status := case
    when v_fee = 0 then 'no_fee_due'
    else 'awaiting_invoice'
  end;

  v_settlement_id := 'recovery-settlement-' || new.id;

  insert into public.claim_recovery_settlements (
    id,
    claim_id,
    claim_reference,
    authority_review_id,
    submission_id,
    filing_package_id,
    commercial_quote_id,
    fee_agreement_id,
    payment_route,
    launch_payment_track,
    representative_may_receive_payment,
    fee_collection_method,
    recovered_at,
    gross_recovery_cents,
    fee_model,
    selected_percentage,
    selected_flat_amount_cents,
    legal_fee_cap_percent_snapshot,
    legal_fee_cap_amount_snapshot_cents,
    internal_fee_cap_amount_snapshot_cents,
    calculated_service_fee_cents,
    claimant_economic_net_cents,
    status,
    opened_by_user_id
  ) values (
    v_settlement_id,
    new.claim_id,
    new.claim_reference,
    new.id,
    new.submission_id,
    new.filing_package_id,
    v_quote.quote_id,
    v_onboarding.fee_agreement_id,
    v_payment_route,
    v_launch_payment_track,
    v_representative_may_receive,
    v_fee_collection_method,
    new.recovered_at,
    new.recovered_amount_cents,
    v_quote.fee_model,
    v_quote.selected_percentage,
    v_quote.selected_flat_amount_cents,
    v_quote.legal_fee_cap_percent_snapshot,
    v_quote.legal_fee_cap_amount_snapshot_cents,
    v_quote.internal_fee_cap_amount_snapshot_cents,
    v_fee,
    new.recovered_amount_cents - v_fee,
    v_status,
    new.last_action_by_user_id
  );

  insert into public.claim_recovery_audit (
    id,
    claim_id,
    settlement_id,
    action,
    actor_user_id,
    occurred_at,
    amount_cents,
    summary,
    detail
  ) values (
    'recovery-audit-opened-' || new.id,
    new.claim_id,
    v_settlement_id,
    'recovery_settlement_opened',
    new.last_action_by_user_id,
    new.recovered_at,
    new.recovered_amount_cents,
    'Recovery settlement opened from the durable authority recovery record.',
    pg_catalog.jsonb_build_object(
      'calculatedServiceFeeCents', v_fee,
      'claimantEconomicNetCents', new.recovered_amount_cents - v_fee,
      'feeModel', v_quote.fee_model,
      'selectedPercentage', v_quote.selected_percentage,
      'selectedFlatAmountCents', v_quote.selected_flat_amount_cents,
      'paymentRoute', v_payment_route,
      'feeCollectionMethod', v_fee_collection_method
    )
  );

  return new;
end;
$function$;;
