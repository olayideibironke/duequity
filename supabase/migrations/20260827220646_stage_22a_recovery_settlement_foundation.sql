create table public.claim_recovery_settlements (
  id text primary key,
  claim_id text not null unique,
  claim_reference text not null,
  authority_review_id text not null unique,
  submission_id text not null,
  filing_package_id text not null,
  commercial_quote_id text not null,
  fee_agreement_id text not null,
  payment_route text not null,
  launch_payment_track text not null,
  representative_may_receive_payment text not null,
  fee_collection_method text not null,
  recovered_at timestamptz not null,
  gross_recovery_cents bigint not null,
  fee_model text not null,
  selected_percentage numeric,
  selected_flat_amount_cents bigint,
  legal_fee_cap_percent_snapshot numeric,
  legal_fee_cap_amount_snapshot_cents bigint,
  internal_fee_cap_amount_snapshot_cents bigint,
  calculated_service_fee_cents bigint not null,
  claimant_economic_net_cents bigint not null,
  status text not null default 'awaiting_invoice',
  opened_by_user_id text not null,
  reconciled_at timestamptz,
  reconciled_by_user_id text,
  reconciliation_summary text,
  row_version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint claim_recovery_settlements_claim_fk foreign key (claim_id) references public.claimant_onboarding(claim_id) on update restrict on delete restrict,
  constraint claim_recovery_settlements_review_fk foreign key (authority_review_id) references public.claim_authority_reviews(id) on update restrict on delete restrict,
  constraint claim_recovery_settlements_submission_fk foreign key (submission_id) references public.claim_submissions(id) on update restrict on delete restrict,
  constraint claim_recovery_settlements_package_fk foreign key (filing_package_id) references public.claim_filing_packages(id) on update restrict on delete restrict,
  constraint claim_recovery_settlements_quote_fk foreign key (commercial_quote_id) references public.commercial_fee_quotes(quote_id) on update restrict on delete restrict,
  constraint claim_recovery_settlements_id_chk check (btrim(id) <> ''),
  constraint claim_recovery_settlements_reference_chk check (btrim(claim_reference) <> ''),
  constraint claim_recovery_settlements_fee_agreement_chk check (btrim(fee_agreement_id) <> ''),
  constraint claim_recovery_settlements_payment_route_chk check (btrim(payment_route) <> ''),
  constraint claim_recovery_settlements_track_chk check (btrim(launch_payment_track) <> ''),
  constraint claim_recovery_settlements_receive_chk check (representative_may_receive_payment in ('yes','no')),
  constraint claim_recovery_settlements_collection_chk check (btrim(fee_collection_method) <> ''),
  constraint claim_recovery_settlements_amounts_chk check (
    gross_recovery_cents >= 0
    and calculated_service_fee_cents >= 0
    and calculated_service_fee_cents <= gross_recovery_cents
    and claimant_economic_net_cents = gross_recovery_cents - calculated_service_fee_cents
    and claimant_economic_net_cents >= 0
  ),
  constraint claim_recovery_settlements_model_chk check (
    (fee_model = 'percentage' and selected_percentage is not null and selected_percentage >= 0 and selected_flat_amount_cents is null)
    or
    (fee_model = 'flat' and selected_flat_amount_cents is not null and selected_flat_amount_cents >= 0 and selected_percentage is null)
  ),
  constraint claim_recovery_settlements_caps_chk check (
    (legal_fee_cap_percent_snapshot is null or legal_fee_cap_percent_snapshot >= 0)
    and (legal_fee_cap_amount_snapshot_cents is null or legal_fee_cap_amount_snapshot_cents >= 0)
    and (internal_fee_cap_amount_snapshot_cents is null or internal_fee_cap_amount_snapshot_cents >= 0)
  ),
  constraint claim_recovery_settlements_status_chk check (status in ('no_fee_due','awaiting_invoice','invoice_open','partially_paid','fee_settled','reconciled')),
  constraint claim_recovery_settlements_reconcile_state_chk check (
    (status <> 'reconciled' and reconciled_at is null and reconciled_by_user_id is null and reconciliation_summary is null)
    or
    (status = 'reconciled' and reconciled_at is not null and reconciled_by_user_id is not null and btrim(reconciled_by_user_id) <> '' and reconciliation_summary is not null and btrim(reconciliation_summary) <> '')
  ),
  constraint claim_recovery_settlements_actor_chk check (btrim(opened_by_user_id) <> ''),
  constraint claim_recovery_settlements_version_chk check (row_version >= 1)
);

create index claim_recovery_settlements_status_idx on public.claim_recovery_settlements(status);
create index claim_recovery_settlements_recovered_at_idx on public.claim_recovery_settlements(recovered_at desc);

create table public.claim_recovery_fee_invoices (
  id text primary key,
  settlement_id text not null unique,
  claim_id text not null unique,
  invoice_number text not null unique,
  issued_at timestamptz not null,
  due_at timestamptz,
  invoice_amount_cents bigint not null,
  amount_paid_cents bigint not null default 0,
  amount_waived_cents bigint not null default 0,
  balance_due_cents bigint not null,
  status text not null default 'open',
  issued_by_user_id text not null,
  last_action_by_user_id text not null,
  settled_at timestamptz,
  waiver_reason text,
  row_version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint claim_recovery_fee_invoices_settlement_fk foreign key (settlement_id) references public.claim_recovery_settlements(id) on update restrict on delete restrict,
  constraint claim_recovery_fee_invoices_claim_fk foreign key (claim_id) references public.claimant_onboarding(claim_id) on update restrict on delete restrict,
  constraint claim_recovery_fee_invoices_id_chk check (btrim(id) <> ''),
  constraint claim_recovery_fee_invoices_number_chk check (btrim(invoice_number) <> ''),
  constraint claim_recovery_fee_invoices_amounts_chk check (
    invoice_amount_cents > 0
    and amount_paid_cents >= 0
    and amount_waived_cents >= 0
    and balance_due_cents >= 0
    and amount_paid_cents + amount_waived_cents + balance_due_cents = invoice_amount_cents
  ),
  constraint claim_recovery_fee_invoices_due_chk check (due_at is null or due_at >= issued_at),
  constraint claim_recovery_fee_invoices_status_chk check (status in ('open','partially_paid','paid','waived','settled')),
  constraint claim_recovery_fee_invoices_state_chk check (
    (status = 'open' and amount_paid_cents = 0 and amount_waived_cents = 0 and balance_due_cents = invoice_amount_cents and settled_at is null)
    or
    (status = 'partially_paid' and amount_paid_cents > 0 and balance_due_cents > 0 and settled_at is null)
    or
    (status = 'paid' and amount_paid_cents = invoice_amount_cents and amount_waived_cents = 0 and balance_due_cents = 0 and settled_at is not null)
    or
    (status = 'waived' and amount_paid_cents = 0 and amount_waived_cents = invoice_amount_cents and balance_due_cents = 0 and settled_at is not null and waiver_reason is not null and btrim(waiver_reason) <> '')
    or
    (status = 'settled' and amount_paid_cents > 0 and amount_waived_cents > 0 and balance_due_cents = 0 and settled_at is not null and waiver_reason is not null and btrim(waiver_reason) <> '')
  ),
  constraint claim_recovery_fee_invoices_actor_chk check (btrim(issued_by_user_id) <> '' and btrim(last_action_by_user_id) <> ''),
  constraint claim_recovery_fee_invoices_version_chk check (row_version >= 1)
);

create index claim_recovery_fee_invoices_status_idx on public.claim_recovery_fee_invoices(status);
create index claim_recovery_fee_invoices_due_at_idx on public.claim_recovery_fee_invoices(due_at) where due_at is not null;

create table public.claim_recovery_fee_payments (
  id text primary key,
  invoice_id text not null,
  settlement_id text not null,
  claim_id text not null,
  received_at timestamptz not null,
  amount_cents bigint not null,
  payment_method text not null,
  payment_reference text,
  note text,
  status text not null default 'posted',
  recorded_by_user_id text not null,
  voided_at timestamptz,
  voided_by_user_id text,
  void_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint claim_recovery_fee_payments_invoice_fk foreign key (invoice_id) references public.claim_recovery_fee_invoices(id) on update restrict on delete restrict,
  constraint claim_recovery_fee_payments_settlement_fk foreign key (settlement_id) references public.claim_recovery_settlements(id) on update restrict on delete restrict,
  constraint claim_recovery_fee_payments_claim_fk foreign key (claim_id) references public.claimant_onboarding(claim_id) on update restrict on delete restrict,
  constraint claim_recovery_fee_payments_id_chk check (btrim(id) <> ''),
  constraint claim_recovery_fee_payments_amount_chk check (amount_cents > 0),
  constraint claim_recovery_fee_payments_method_chk check (btrim(payment_method) <> ''),
  constraint claim_recovery_fee_payments_reference_chk check (payment_reference is null or btrim(payment_reference) <> ''),
  constraint claim_recovery_fee_payments_note_chk check (note is null or btrim(note) <> ''),
  constraint claim_recovery_fee_payments_status_chk check (status in ('posted','voided')),
  constraint claim_recovery_fee_payments_actor_chk check (btrim(recorded_by_user_id) <> ''),
  constraint claim_recovery_fee_payments_void_state_chk check (
    (status = 'posted' and voided_at is null and voided_by_user_id is null and void_reason is null)
    or
    (status = 'voided' and voided_at is not null and voided_by_user_id is not null and btrim(voided_by_user_id) <> '' and void_reason is not null and btrim(void_reason) <> '')
  )
);

create index claim_recovery_fee_payments_invoice_idx on public.claim_recovery_fee_payments(invoice_id, received_at);
create index claim_recovery_fee_payments_claim_idx on public.claim_recovery_fee_payments(claim_id, received_at);

create table public.claim_recovery_audit (
  id text primary key,
  claim_id text not null,
  settlement_id text not null,
  invoice_id text,
  payment_id text,
  action text not null,
  actor_user_id text not null,
  occurred_at timestamptz not null,
  amount_cents bigint,
  external_reference text,
  summary text,
  detail jsonb,
  created_at timestamptz not null default now(),
  constraint claim_recovery_audit_claim_fk foreign key (claim_id) references public.claimant_onboarding(claim_id) on update restrict on delete restrict,
  constraint claim_recovery_audit_settlement_fk foreign key (settlement_id) references public.claim_recovery_settlements(id) on update restrict on delete restrict,
  constraint claim_recovery_audit_invoice_fk foreign key (invoice_id) references public.claim_recovery_fee_invoices(id) on update restrict on delete restrict,
  constraint claim_recovery_audit_payment_fk foreign key (payment_id) references public.claim_recovery_fee_payments(id) on update restrict on delete restrict,
  constraint claim_recovery_audit_id_chk check (btrim(id) <> ''),
  constraint claim_recovery_audit_action_chk check (btrim(action) <> ''),
  constraint claim_recovery_audit_actor_chk check (btrim(actor_user_id) <> ''),
  constraint claim_recovery_audit_amount_chk check (amount_cents is null or amount_cents >= 0),
  constraint claim_recovery_audit_reference_chk check (external_reference is null or btrim(external_reference) <> ''),
  constraint claim_recovery_audit_summary_chk check (summary is null or btrim(summary) <> ''),
  constraint claim_recovery_audit_detail_chk check (detail is null or jsonb_typeof(detail) = 'object')
);

create index claim_recovery_audit_claim_idx on public.claim_recovery_audit(claim_id, occurred_at desc);
create index claim_recovery_audit_settlement_idx on public.claim_recovery_audit(settlement_id, occurred_at desc);

create or replace function public.reject_claim_recovery_audit_change()
returns trigger
language plpgsql
set search_path to 'pg_catalog'
as $function$
begin
  raise exception 'claim recovery audit records are append-only'
    using errcode = '42501';
end;
$function$;

create trigger claim_recovery_audit_update_guard
before update on public.claim_recovery_audit
for each row execute function public.reject_claim_recovery_audit_change();

create trigger claim_recovery_audit_delete_guard
before delete on public.claim_recovery_audit
for each row execute function public.reject_claim_recovery_audit_change();

create or replace function public.reject_claim_recovery_settlement_delete()
returns trigger
language plpgsql
set search_path to 'pg_catalog'
as $function$
begin
  raise exception 'claim recovery settlements cannot be deleted'
    using errcode = '42501';
end;
$function$;

create trigger claim_recovery_settlements_delete_guard
before delete on public.claim_recovery_settlements
for each row execute function public.reject_claim_recovery_settlement_delete();

create or replace function public.guard_claim_recovery_settlement_update()
returns trigger
language plpgsql
set search_path to 'pg_catalog'
as $function$
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
    raise exception 'claim recovery provenance, recovered amount, and fee calculation are immutable'
      using errcode = '42501';
  end if;

  if old.status = 'reconciled' then
    raise exception 'reconciled claim recovery settlement is terminal'
      using errcode = '42501';
  end if;

  new.row_version := old.row_version + 1;
  new.updated_at := pg_catalog.clock_timestamp();
  return new;
end;
$function$;

create trigger claim_recovery_settlements_update_guard
before update on public.claim_recovery_settlements
for each row execute function public.guard_claim_recovery_settlement_update();

create or replace function public.reject_claim_recovery_fee_invoice_delete()
returns trigger
language plpgsql
set search_path to 'pg_catalog'
as $function$
begin
  raise exception 'claim recovery fee invoices cannot be deleted'
    using errcode = '42501';
end;
$function$;

create trigger claim_recovery_fee_invoices_delete_guard
before delete on public.claim_recovery_fee_invoices
for each row execute function public.reject_claim_recovery_fee_invoice_delete();

create or replace function public.guard_claim_recovery_fee_invoice_update()
returns trigger
language plpgsql
set search_path to 'pg_catalog'
as $function$
begin
  if new.id is distinct from old.id
     or new.settlement_id is distinct from old.settlement_id
     or new.claim_id is distinct from old.claim_id
     or new.invoice_number is distinct from old.invoice_number
     or new.issued_at is distinct from old.issued_at
     or new.due_at is distinct from old.due_at
     or new.invoice_amount_cents is distinct from old.invoice_amount_cents
     or new.issued_by_user_id is distinct from old.issued_by_user_id
     or new.created_at is distinct from old.created_at then
    raise exception 'claim recovery fee invoice provenance and original invoice terms are immutable'
      using errcode = '42501';
  end if;

  if old.status in ('paid','waived','settled') then
    raise exception 'settled claim recovery fee invoice is terminal'
      using errcode = '42501';
  end if;

  new.row_version := old.row_version + 1;
  new.updated_at := pg_catalog.clock_timestamp();
  return new;
end;
$function$;

create trigger claim_recovery_fee_invoices_update_guard
before update on public.claim_recovery_fee_invoices
for each row execute function public.guard_claim_recovery_fee_invoice_update();

create or replace function public.guard_claim_recovery_fee_payment_insert()
returns trigger
language plpgsql
set search_path to 'pg_catalog'
as $function$
declare
  v_invoice public.claim_recovery_fee_invoices%rowtype;
begin
  select * into v_invoice
  from public.claim_recovery_fee_invoices
  where id = new.invoice_id;

  if not found then
    raise exception 'claim recovery fee invoice not found'
      using errcode = '23503';
  end if;

  if new.settlement_id is distinct from v_invoice.settlement_id
     or new.claim_id is distinct from v_invoice.claim_id then
    raise exception 'claim recovery fee payment does not match invoice provenance'
      using errcode = '42501';
  end if;

  if v_invoice.status in ('paid','waived','settled') then
    raise exception 'cannot post payment to a settled fee invoice'
      using errcode = '42501';
  end if;

  if new.amount_cents > v_invoice.balance_due_cents then
    raise exception 'fee payment exceeds current invoice balance'
      using errcode = '22023';
  end if;

  return new;
end;
$function$;

create trigger claim_recovery_fee_payments_insert_guard
before insert on public.claim_recovery_fee_payments
for each row execute function public.guard_claim_recovery_fee_payment_insert();

create or replace function public.guard_claim_recovery_fee_payment_update()
returns trigger
language plpgsql
set search_path to 'pg_catalog'
as $function$
begin
  if new.id is distinct from old.id
     or new.invoice_id is distinct from old.invoice_id
     or new.settlement_id is distinct from old.settlement_id
     or new.claim_id is distinct from old.claim_id
     or new.received_at is distinct from old.received_at
     or new.amount_cents is distinct from old.amount_cents
     or new.payment_method is distinct from old.payment_method
     or new.payment_reference is distinct from old.payment_reference
     or new.note is distinct from old.note
     or new.recorded_by_user_id is distinct from old.recorded_by_user_id
     or new.created_at is distinct from old.created_at then
    raise exception 'claim recovery fee payment provenance and posted payment facts are immutable'
      using errcode = '42501';
  end if;

  if old.status = 'voided' then
    raise exception 'voided claim recovery fee payment is terminal'
      using errcode = '42501';
  end if;

  if old.status = 'posted' and new.status not in ('posted','voided') then
    raise exception 'invalid claim recovery fee payment transition'
      using errcode = '42501';
  end if;

  new.updated_at := pg_catalog.clock_timestamp();
  return new;
end;
$function$;

create trigger claim_recovery_fee_payments_update_guard
before update on public.claim_recovery_fee_payments
for each row execute function public.guard_claim_recovery_fee_payment_update();

create or replace function public.reject_claim_recovery_fee_payment_delete()
returns trigger
language plpgsql
set search_path to 'pg_catalog'
as $function$
begin
  raise exception 'claim recovery fee payments cannot be deleted; void the payment instead'
    using errcode = '42501';
end;
$function$;

create trigger claim_recovery_fee_payments_delete_guard
before delete on public.claim_recovery_fee_payments
for each row execute function public.reject_claim_recovery_fee_payment_delete();

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
    v_base_fee := pg_catalog.round(new.recovered_amount_cents::numeric * v_quote.selected_percentage);
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
    v_legal_percent_cap := pg_catalog.round(new.recovered_amount_cents::numeric * v_quote.legal_fee_cap_percent_snapshot)::bigint;
    v_fee := pg_catalog.least(v_fee, v_legal_percent_cap);
  end if;

  if v_quote.legal_fee_cap_amount_snapshot_cents is not null then
    v_fee := pg_catalog.least(v_fee, v_quote.legal_fee_cap_amount_snapshot_cents);
  end if;

  if v_quote.internal_fee_cap_amount_snapshot_cents is not null then
    v_fee := pg_catalog.least(v_fee, v_quote.internal_fee_cap_amount_snapshot_cents);
  end if;

  v_fee := pg_catalog.greatest(0, pg_catalog.least(v_fee, new.recovered_amount_cents));
  v_status := case when v_fee = 0 then 'no_fee_due' else 'awaiting_invoice' end;
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
$function$;

create trigger claim_authority_reviews_recovery_settlement_bootstrap
after update on public.claim_authority_reviews
for each row execute function public.bootstrap_claim_recovery_settlement_from_authority_review();

alter table public.claim_recovery_settlements enable row level security;
alter table public.claim_recovery_fee_invoices enable row level security;
alter table public.claim_recovery_fee_payments enable row level security;
alter table public.claim_recovery_audit enable row level security;

revoke all on public.claim_recovery_settlements from public, anon, authenticated;
revoke all on public.claim_recovery_fee_invoices from public, anon, authenticated;
revoke all on public.claim_recovery_fee_payments from public, anon, authenticated;
revoke all on public.claim_recovery_audit from public, anon, authenticated;

grant select, insert, update on public.claim_recovery_settlements to service_role;
grant select, insert, update on public.claim_recovery_fee_invoices to service_role;
grant select, insert, update on public.claim_recovery_fee_payments to service_role;
grant select, insert on public.claim_recovery_audit to service_role;

revoke execute on function public.bootstrap_claim_recovery_settlement_from_authority_review() from public, anon, authenticated;
grant execute on function public.bootstrap_claim_recovery_settlement_from_authority_review() to service_role;;
