create or replace function public.guard_claim_recovery_settlement_insert()
returns trigger
language plpgsql
set search_path to 'pg_catalog'
as $fn$
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
    v_expected_fee := pg_catalog.least(v_expected_fee, v_percent_cap);
  end if;
  if v_quote.legal_fee_cap_amount_snapshot_cents is not null then v_expected_fee := pg_catalog.least(v_expected_fee, v_quote.legal_fee_cap_amount_snapshot_cents); end if;
  if v_quote.internal_fee_cap_amount_snapshot_cents is not null then v_expected_fee := pg_catalog.least(v_expected_fee, v_quote.internal_fee_cap_amount_snapshot_cents); end if;
  v_expected_fee := pg_catalog.greatest(0, pg_catalog.least(v_expected_fee, new.gross_recovery_cents));
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
$fn$;

create trigger claim_recovery_settlements_insert_guard
before insert on public.claim_recovery_settlements
for each row execute function public.guard_claim_recovery_settlement_insert();

create or replace function public.guard_claim_recovery_settlement_update()
returns trigger
language plpgsql
set search_path to 'pg_catalog'
as $fn$
declare
  v_invoice public.claim_recovery_fee_invoices%rowtype;
  v_expected_status text;
begin
  if new.id is distinct from old.id
     or new.claim_id is distinct from old.claim_id
     or new.claim_reference is distinct from old.claim_reference
     or new.authority_review_id is distinct from old.authority_review_id
     or new.submission_id is distinct from old.submission_id
     or new.filing_package_id is distinct from old.filing_package_id
     or new.commercial_quote_id is distinct from old.commercial_quote_id
     or new.fee_agreement_id is distinct from old.fee_agreement_id
     or new.payment_route is distinct from old.payment_route
     or new.launch_payment_track is distinct from old.launch_payment_track
     or new.representative_may_receive_payment is distinct from old.representative_may_receive_payment
     or new.fee_collection_method is distinct from old.fee_collection_method
     or new.recovered_at is distinct from old.recovered_at
     or new.gross_recovery_cents is distinct from old.gross_recovery_cents
     or new.fee_model is distinct from old.fee_model
     or new.selected_percentage is distinct from old.selected_percentage
     or new.selected_flat_amount_cents is distinct from old.selected_flat_amount_cents
     or new.legal_fee_cap_percent_snapshot is distinct from old.legal_fee_cap_percent_snapshot
     or new.legal_fee_cap_amount_snapshot_cents is distinct from old.legal_fee_cap_amount_snapshot_cents
     or new.internal_fee_cap_amount_snapshot_cents is distinct from old.internal_fee_cap_amount_snapshot_cents
     or new.calculated_service_fee_cents is distinct from old.calculated_service_fee_cents
     or new.claimant_economic_net_cents is distinct from old.claimant_economic_net_cents
     or new.opened_by_user_id is distinct from old.opened_by_user_id
     or new.created_at is distinct from old.created_at then
    raise exception 'claim recovery provenance, recovered amount, and fee calculation are immutable' using errcode='42501';
  end if;

  if old.status = 'reconciled' then raise exception 'reconciled claim recovery settlement is terminal' using errcode='42501'; end if;

  if new.status = 'reconciled' then
    if old.status not in ('no_fee_due','fee_settled') then raise exception 'recovery settlement cannot reconcile before fee resolution' using errcode='42501'; end if;
  elsif new.calculated_service_fee_cents = 0 then
    if new.status <> 'no_fee_due' then raise exception 'zero-fee recovery settlement must remain no-fee-due until reconciliation' using errcode='42501'; end if;
  elsif new.status in ('invoice_open','partially_paid','fee_settled') then
    select * into v_invoice from public.claim_recovery_fee_invoices where settlement_id = old.id;
    if not found then raise exception 'recovery settlement invoice state requires a fee invoice' using errcode='42501'; end if;
    v_expected_status := case
      when v_invoice.status = 'open' then 'invoice_open'
      when v_invoice.status = 'partially_paid' then 'partially_paid'
      when v_invoice.status in ('paid','waived','settled') then 'fee_settled'
      else null
    end;
    if new.status is distinct from v_expected_status then raise exception 'recovery settlement status does not match fee invoice state' using errcode='42501'; end if;
  elsif new.status <> 'awaiting_invoice' then
    raise exception 'invalid recovery settlement state transition' using errcode='42501';
  end if;

  new.row_version := old.row_version + 1;
  new.updated_at := pg_catalog.clock_timestamp();
  return new;
end;
$fn$;

create or replace function public.guard_claim_recovery_fee_invoice_insert()
returns trigger
language plpgsql
set search_path to 'pg_catalog'
as $fn$
declare
  v_settlement public.claim_recovery_settlements%rowtype;
begin
  select * into v_settlement from public.claim_recovery_settlements where id = new.settlement_id;
  if not found then raise exception 'recovery settlement not found for fee invoice' using errcode='23503'; end if;
  if new.claim_id is distinct from v_settlement.claim_id then raise exception 'fee invoice does not match recovery settlement claim' using errcode='42501'; end if;
  if v_settlement.status <> 'awaiting_invoice' or v_settlement.calculated_service_fee_cents <= 0 then raise exception 'fee invoice can be issued only for a recovery settlement with a positive fee due' using errcode='42501'; end if;
  if new.invoice_amount_cents is distinct from v_settlement.calculated_service_fee_cents
     or new.amount_paid_cents <> 0 or new.amount_waived_cents <> 0
     or new.balance_due_cents is distinct from new.invoice_amount_cents
     or new.status <> 'open' or new.settled_at is not null or new.waiver_reason is not null then
    raise exception 'new recovery fee invoice must exactly match the immutable calculated service fee and begin open' using errcode='42501';
  end if;
  return new;
end;
$fn$;

create trigger claim_recovery_fee_invoices_insert_guard
before insert on public.claim_recovery_fee_invoices
for each row execute function public.guard_claim_recovery_fee_invoice_insert();

create or replace function public.guard_claim_recovery_fee_invoice_update()
returns trigger
language plpgsql
set search_path to 'pg_catalog'
as $fn$
declare
  v_settlement_status text;
  v_posted_payments bigint;
  v_expected_balance bigint;
  v_expected_status text;
begin
  if new.id is distinct from old.id or new.settlement_id is distinct from old.settlement_id or new.claim_id is distinct from old.claim_id
     or new.invoice_number is distinct from old.invoice_number or new.issued_at is distinct from old.issued_at or new.due_at is distinct from old.due_at
     or new.invoice_amount_cents is distinct from old.invoice_amount_cents or new.issued_by_user_id is distinct from old.issued_by_user_id
     or new.created_at is distinct from old.created_at then
    raise exception 'claim recovery fee invoice provenance and original invoice terms are immutable' using errcode='42501';
  end if;

  select status into v_settlement_status from public.claim_recovery_settlements where id = old.settlement_id;
  if v_settlement_status = 'reconciled' then raise exception 'reconciled recovery settlement cannot change its fee invoice' using errcode='42501'; end if;

  select coalesce(sum(amount_cents),0)::bigint into v_posted_payments from public.claim_recovery_fee_payments where invoice_id = old.id and status = 'posted';
  if new.amount_paid_cents is distinct from v_posted_payments then raise exception 'fee invoice paid amount must equal posted fee payments' using errcode='42501'; end if;
  if new.amount_waived_cents < 0 or new.amount_paid_cents + new.amount_waived_cents > new.invoice_amount_cents then raise exception 'fee invoice paid and waived amounts exceed invoice amount' using errcode='22023'; end if;

  v_expected_balance := new.invoice_amount_cents - new.amount_paid_cents - new.amount_waived_cents;
  if new.balance_due_cents is distinct from v_expected_balance then raise exception 'fee invoice balance does not reconcile' using errcode='42501'; end if;

  if v_expected_balance > 0 then
    v_expected_status := case when new.amount_paid_cents = 0 and new.amount_waived_cents = 0 then 'open' else 'partially_paid' end;
    if new.settled_at is not null then raise exception 'open fee balance cannot have a settlement timestamp' using errcode='42501'; end if;
  else
    v_expected_status := case
      when new.amount_paid_cents = new.invoice_amount_cents and new.amount_waived_cents = 0 then 'paid'
      when new.amount_paid_cents = 0 and new.amount_waived_cents = new.invoice_amount_cents then 'waived'
      else 'settled'
    end;
    if new.settled_at is null then raise exception 'settled fee balance requires settlement timestamp' using errcode='42501'; end if;
  end if;

  if new.status is distinct from v_expected_status then raise exception 'fee invoice status does not match reconciled amounts' using errcode='42501'; end if;
  if new.amount_waived_cents = 0 and new.waiver_reason is not null then raise exception 'waiver reason requires a waived amount' using errcode='42501'; end if;
  if new.amount_waived_cents > 0 and (new.waiver_reason is null or btrim(new.waiver_reason) = '') then raise exception 'waived fee amount requires a waiver reason' using errcode='42501'; end if;

  new.row_version := old.row_version + 1;
  new.updated_at := pg_catalog.clock_timestamp();
  return new;
end;
$fn$;

create or replace function public.guard_claim_recovery_fee_payment_insert()
returns trigger
language plpgsql
set search_path to 'pg_catalog'
as $fn$
declare
  v_invoice public.claim_recovery_fee_invoices%rowtype;
begin
  select * into v_invoice from public.claim_recovery_fee_invoices where id = new.invoice_id;
  if not found then raise exception 'claim recovery fee invoice not found' using errcode='23503'; end if;
  if new.settlement_id is distinct from v_invoice.settlement_id or new.claim_id is distinct from v_invoice.claim_id then raise exception 'claim recovery fee payment does not match invoice provenance' using errcode='42501'; end if;
  if v_invoice.status in ('paid','waived','settled') then raise exception 'cannot post payment to a settled fee invoice' using errcode='42501'; end if;
  if new.received_at < v_invoice.issued_at then raise exception 'fee payment cannot precede invoice issuance' using errcode='22023'; end if;
  if new.amount_cents > v_invoice.balance_due_cents then raise exception 'fee payment exceeds current invoice balance' using errcode='22023'; end if;
  return new;
end;
$fn$;

create or replace function public.issue_claim_recovery_fee_invoice(p_settlement_id text,p_invoice_id text,p_invoice_number text,p_actor_user_id text,p_issued_at timestamptz,p_due_at timestamptz default null)
returns setof public.claim_recovery_fee_invoices
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare v_settlement public.claim_recovery_settlements%rowtype; v_invoice public.claim_recovery_fee_invoices%rowtype;
begin
  if p_invoice_id is null or btrim(p_invoice_id)='' or p_invoice_number is null or btrim(p_invoice_number)='' then raise exception 'invoice id and invoice number are required' using errcode='22023'; end if;
  if p_actor_user_id is null or btrim(p_actor_user_id)='' or p_issued_at is null then raise exception 'invoice actor and issued timestamp are required' using errcode='22023'; end if;
  select * into v_settlement from public.claim_recovery_settlements where id=p_settlement_id for update;
  if not found then raise exception 'recovery settlement not found' using errcode='P0002'; end if;
  if v_settlement.status <> 'awaiting_invoice' or v_settlement.calculated_service_fee_cents <= 0 then raise exception 'recovery settlement is not eligible for fee invoice issuance' using errcode='42501'; end if;
  if p_issued_at < v_settlement.recovered_at then raise exception 'fee invoice cannot precede actual recovery' using errcode='22023'; end if;
  if p_due_at is not null and p_due_at < p_issued_at then raise exception 'fee invoice due date cannot precede issue date' using errcode='22023'; end if;
  insert into public.claim_recovery_fee_invoices(id,settlement_id,claim_id,invoice_number,issued_at,due_at,invoice_amount_cents,amount_paid_cents,amount_waived_cents,balance_due_cents,status,issued_by_user_id,last_action_by_user_id)
  values(p_invoice_id,v_settlement.id,v_settlement.claim_id,btrim(p_invoice_number),p_issued_at,p_due_at,v_settlement.calculated_service_fee_cents,0,0,v_settlement.calculated_service_fee_cents,'open',p_actor_user_id,p_actor_user_id) returning * into v_invoice;
  update public.claim_recovery_settlements set status='invoice_open' where id=v_settlement.id;
  insert into public.claim_recovery_audit(id,claim_id,settlement_id,invoice_id,action,actor_user_id,occurred_at,amount_cents,external_reference,summary)
  values('recovery-audit-invoice-'||gen_random_uuid()::text,v_settlement.claim_id,v_settlement.id,v_invoice.id,'fee_invoice_issued',p_actor_user_id,p_issued_at,v_invoice.invoice_amount_cents,v_invoice.invoice_number,'DueQuity recovery service fee invoice issued after actual recovery.');
  return next v_invoice; return;
end;
$fn$;

create or replace function public.record_claim_recovery_fee_payment(p_invoice_id text,p_payment_id text,p_actor_user_id text,p_received_at timestamptz,p_amount_cents bigint,p_payment_method text,p_payment_reference text default null,p_note text default null)
returns setof public.claim_recovery_fee_invoices
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare v_invoice public.claim_recovery_fee_invoices%rowtype; v_payment public.claim_recovery_fee_payments%rowtype; v_paid bigint; v_balance bigint; v_status text; v_settled_at timestamptz;
begin
  if p_payment_id is null or btrim(p_payment_id)='' or p_actor_user_id is null or btrim(p_actor_user_id)='' then raise exception 'payment id and actor are required' using errcode='22023'; end if;
  if p_received_at is null or p_amount_cents is null or p_amount_cents <= 0 or p_payment_method is null or btrim(p_payment_method)='' then raise exception 'valid payment timestamp, positive amount, and method are required' using errcode='22023'; end if;
  select * into v_invoice from public.claim_recovery_fee_invoices where id=p_invoice_id for update;
  if not found then raise exception 'fee invoice not found' using errcode='P0002'; end if;
  if v_invoice.balance_due_cents <= 0 then raise exception 'fee invoice has no outstanding balance' using errcode='42501'; end if;
  if p_received_at < v_invoice.issued_at then raise exception 'fee payment cannot precede invoice issuance' using errcode='22023'; end if;
  if p_amount_cents > v_invoice.balance_due_cents then raise exception 'fee payment exceeds current invoice balance' using errcode='22023'; end if;
  insert into public.claim_recovery_fee_payments(id,invoice_id,settlement_id,claim_id,received_at,amount_cents,payment_method,payment_reference,note,status,recorded_by_user_id)
  values(p_payment_id,v_invoice.id,v_invoice.settlement_id,v_invoice.claim_id,p_received_at,p_amount_cents,btrim(p_payment_method),nullif(btrim(p_payment_reference),''),nullif(btrim(p_note),''),'posted',p_actor_user_id) returning * into v_payment;
  select coalesce(sum(amount_cents),0)::bigint into v_paid from public.claim_recovery_fee_payments where invoice_id=v_invoice.id and status='posted';
  v_balance := v_invoice.invoice_amount_cents - v_paid - v_invoice.amount_waived_cents;
  if v_balance = 0 then v_status := case when v_invoice.amount_waived_cents=0 then 'paid' else 'settled' end; v_settled_at:=p_received_at; else v_status:='partially_paid'; v_settled_at:=null; end if;
  update public.claim_recovery_fee_invoices set amount_paid_cents=v_paid,balance_due_cents=v_balance,status=v_status,settled_at=v_settled_at,last_action_by_user_id=p_actor_user_id where id=v_invoice.id returning * into v_invoice;
  update public.claim_recovery_settlements set status=case when v_balance=0 then 'fee_settled' else 'partially_paid' end where id=v_invoice.settlement_id;
  insert into public.claim_recovery_audit(id,claim_id,settlement_id,invoice_id,payment_id,action,actor_user_id,occurred_at,amount_cents,external_reference,summary,detail)
  values('recovery-audit-payment-'||gen_random_uuid()::text,v_invoice.claim_id,v_invoice.settlement_id,v_invoice.id,v_payment.id,'fee_payment_recorded',p_actor_user_id,p_received_at,p_amount_cents,nullif(btrim(p_payment_reference),''),coalesce(nullif(btrim(p_note),''),'DueQuity recovery service fee payment recorded.'),jsonb_build_object('paymentMethod',btrim(p_payment_method),'balanceDueCents',v_balance));
  return next v_invoice; return;
end;
$fn$;

create or replace function public.waive_claim_recovery_fee_balance(p_invoice_id text,p_actor_user_id text,p_occurred_at timestamptz,p_reason text)
returns setof public.claim_recovery_fee_invoices
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare v_invoice public.claim_recovery_fee_invoices%rowtype; v_waived bigint; v_status text;
begin
  if p_actor_user_id is null or btrim(p_actor_user_id)='' or p_occurred_at is null or p_reason is null or btrim(p_reason)='' then raise exception 'waiver actor, timestamp, and reason are required' using errcode='22023'; end if;
  select * into v_invoice from public.claim_recovery_fee_invoices where id=p_invoice_id for update;
  if not found then raise exception 'fee invoice not found' using errcode='P0002'; end if;
  if v_invoice.balance_due_cents <= 0 then raise exception 'fee invoice has no balance available to waive' using errcode='42501'; end if;
  if p_occurred_at < v_invoice.issued_at then raise exception 'fee waiver cannot precede invoice issuance' using errcode='22023'; end if;
  v_waived := v_invoice.amount_waived_cents + v_invoice.balance_due_cents;
  v_status := case when v_invoice.amount_paid_cents=0 then 'waived' else 'settled' end;
  update public.claim_recovery_fee_invoices set amount_waived_cents=v_waived,balance_due_cents=0,status=v_status,settled_at=p_occurred_at,waiver_reason=btrim(p_reason),last_action_by_user_id=p_actor_user_id where id=v_invoice.id returning * into v_invoice;
  update public.claim_recovery_settlements set status='fee_settled' where id=v_invoice.settlement_id;
  insert into public.claim_recovery_audit(id,claim_id,settlement_id,invoice_id,action,actor_user_id,occurred_at,amount_cents,summary)
  values('recovery-audit-waiver-'||gen_random_uuid()::text,v_invoice.claim_id,v_invoice.settlement_id,v_invoice.id,'fee_balance_waived',p_actor_user_id,p_occurred_at,v_waived,btrim(p_reason));
  return next v_invoice; return;
end;
$fn$;

create or replace function public.void_claim_recovery_fee_payment(p_payment_id text,p_actor_user_id text,p_occurred_at timestamptz,p_reason text)
returns setof public.claim_recovery_fee_invoices
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare v_payment public.claim_recovery_fee_payments%rowtype; v_invoice public.claim_recovery_fee_invoices%rowtype; v_settlement_status text; v_paid bigint; v_balance bigint; v_status text;
begin
  if p_actor_user_id is null or btrim(p_actor_user_id)='' or p_occurred_at is null or p_reason is null or btrim(p_reason)='' then raise exception 'void actor, timestamp, and reason are required' using errcode='22023'; end if;
  select * into v_payment from public.claim_recovery_fee_payments where id=p_payment_id for update;
  if not found then raise exception 'fee payment not found' using errcode='P0002'; end if;
  if v_payment.status <> 'posted' then raise exception 'only a posted fee payment can be voided' using errcode='42501'; end if;
  if p_occurred_at < v_payment.received_at then raise exception 'payment void cannot precede payment receipt' using errcode='22023'; end if;
  select status into v_settlement_status from public.claim_recovery_settlements where id=v_payment.settlement_id;
  if v_settlement_status='reconciled' then raise exception 'reconciled recovery settlement cannot void a fee payment' using errcode='42501'; end if;
  update public.claim_recovery_fee_payments set status='voided',voided_at=p_occurred_at,voided_by_user_id=p_actor_user_id,void_reason=btrim(p_reason) where id=v_payment.id;
  select * into v_invoice from public.claim_recovery_fee_invoices where id=v_payment.invoice_id for update;
  select coalesce(sum(amount_cents),0)::bigint into v_paid from public.claim_recovery_fee_payments where invoice_id=v_invoice.id and status='posted';
  v_balance := v_invoice.invoice_amount_cents - v_paid - v_invoice.amount_waived_cents;
  if v_balance>0 then v_status:=case when v_paid=0 and v_invoice.amount_waived_cents=0 then 'open' else 'partially_paid' end; else v_status:=case when v_paid=v_invoice.invoice_amount_cents and v_invoice.amount_waived_cents=0 then 'paid' when v_paid=0 then 'waived' else 'settled' end; end if;
  update public.claim_recovery_fee_invoices set amount_paid_cents=v_paid,balance_due_cents=v_balance,status=v_status,settled_at=case when v_balance=0 then v_invoice.settled_at else null end,last_action_by_user_id=p_actor_user_id where id=v_invoice.id returning * into v_invoice;
  update public.claim_recovery_settlements set status=case when v_balance=0 then 'fee_settled' when v_paid>0 then 'partially_paid' else 'invoice_open' end where id=v_invoice.settlement_id;
  insert into public.claim_recovery_audit(id,claim_id,settlement_id,invoice_id,payment_id,action,actor_user_id,occurred_at,amount_cents,summary)
  values('recovery-audit-payment-void-'||gen_random_uuid()::text,v_invoice.claim_id,v_invoice.settlement_id,v_invoice.id,v_payment.id,'fee_payment_voided',p_actor_user_id,p_occurred_at,v_payment.amount_cents,btrim(p_reason));
  return next v_invoice; return;
end;
$fn$;

create or replace function public.reconcile_claim_recovery_settlement(p_settlement_id text,p_actor_user_id text,p_occurred_at timestamptz,p_summary text)
returns setof public.claim_recovery_settlements
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare v_settlement public.claim_recovery_settlements%rowtype; v_review_status text; v_invoice public.claim_recovery_fee_invoices%rowtype;
begin
  if p_actor_user_id is null or btrim(p_actor_user_id)='' or p_occurred_at is null or p_summary is null or btrim(p_summary)='' then raise exception 'reconciliation actor, timestamp, and summary are required' using errcode='22023'; end if;
  select * into v_settlement from public.claim_recovery_settlements where id=p_settlement_id for update;
  if not found then raise exception 'recovery settlement not found' using errcode='P0002'; end if;
  if v_settlement.status='reconciled' then raise exception 'recovery settlement is already reconciled' using errcode='42501'; end if;
  if p_occurred_at < v_settlement.recovered_at then raise exception 'reconciliation cannot precede recovery' using errcode='22023'; end if;
  select status into v_review_status from public.claim_authority_reviews where id=v_settlement.authority_review_id;
  if v_review_status not in ('recovered','closed') then raise exception 'reconciliation requires a recovered authority lifecycle' using errcode='42501'; end if;
  if v_settlement.calculated_service_fee_cents=0 then
    if v_settlement.status <> 'no_fee_due' then raise exception 'zero-fee recovery settlement has invalid state' using errcode='42501'; end if;
  else
    select * into v_invoice from public.claim_recovery_fee_invoices where settlement_id=v_settlement.id;
    if not found then raise exception 'positive service fee requires an issued fee invoice before reconciliation' using errcode='42501'; end if;
    if v_invoice.balance_due_cents<>0 or v_invoice.status not in ('paid','waived','settled') then raise exception 'fee invoice must be fully settled before recovery reconciliation' using errcode='42501'; end if;
  end if;
  update public.claim_recovery_settlements set status='reconciled',reconciled_at=p_occurred_at,reconciled_by_user_id=p_actor_user_id,reconciliation_summary=btrim(p_summary) where id=v_settlement.id returning * into v_settlement;
  insert into public.claim_recovery_audit(id,claim_id,settlement_id,invoice_id,action,actor_user_id,occurred_at,amount_cents,summary,detail)
  values('recovery-audit-reconciled-'||gen_random_uuid()::text,v_settlement.claim_id,v_settlement.id,case when v_settlement.calculated_service_fee_cents=0 then null else v_invoice.id end,'recovery_reconciled',p_actor_user_id,p_occurred_at,v_settlement.gross_recovery_cents,btrim(p_summary),jsonb_build_object('calculatedServiceFeeCents',v_settlement.calculated_service_fee_cents,'claimantEconomicNetCents',v_settlement.claimant_economic_net_cents));
  return next v_settlement; return;
end;
$fn$;

revoke execute on function public.guard_claim_recovery_settlement_insert() from public, anon, authenticated;
revoke execute on function public.guard_claim_recovery_settlement_update() from public, anon, authenticated;
revoke execute on function public.guard_claim_recovery_fee_invoice_insert() from public, anon, authenticated;
revoke execute on function public.guard_claim_recovery_fee_invoice_update() from public, anon, authenticated;
revoke execute on function public.guard_claim_recovery_fee_payment_insert() from public, anon, authenticated;
revoke execute on function public.issue_claim_recovery_fee_invoice(text,text,text,text,timestamptz,timestamptz) from public, anon, authenticated;
revoke execute on function public.record_claim_recovery_fee_payment(text,text,text,timestamptz,bigint,text,text,text) from public, anon, authenticated;
revoke execute on function public.waive_claim_recovery_fee_balance(text,text,timestamptz,text) from public, anon, authenticated;
revoke execute on function public.void_claim_recovery_fee_payment(text,text,timestamptz,text) from public, anon, authenticated;
revoke execute on function public.reconcile_claim_recovery_settlement(text,text,timestamptz,text) from public, anon, authenticated;

grant execute on function public.issue_claim_recovery_fee_invoice(text,text,text,text,timestamptz,timestamptz) to service_role;
grant execute on function public.record_claim_recovery_fee_payment(text,text,text,timestamptz,bigint,text,text,text) to service_role;
grant execute on function public.waive_claim_recovery_fee_balance(text,text,timestamptz,text) to service_role;
grant execute on function public.void_claim_recovery_fee_payment(text,text,timestamptz,text) to service_role;
grant execute on function public.reconcile_claim_recovery_settlement(text,text,timestamptz,text) to service_role;;
