create table public.claim_closures (
  id text primary key,
  claim_id text not null unique,
  claim_reference text not null,
  authority_review_id text not null unique,
  recovery_settlement_id text unique,
  final_outcome text not null,
  authority_closed_at timestamptz not null,
  recovery_reconciled_at timestamptz,
  closed_at timestamptz not null,
  closed_by_user_id text not null,
  closure_summary text not null,
  row_version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint claim_closures_claim_fk
    foreign key (claim_id)
    references public.claimant_onboarding(claim_id)
    on update restrict on delete restrict,

  constraint claim_closures_review_fk
    foreign key (authority_review_id)
    references public.claim_authority_reviews(id)
    on update restrict on delete restrict,

  constraint claim_closures_recovery_fk
    foreign key (recovery_settlement_id)
    references public.claim_recovery_settlements(id)
    on update restrict on delete restrict,

  constraint claim_closures_id_chk
    check (btrim(id) <> ''),

  constraint claim_closures_reference_chk
    check (btrim(claim_reference) <> ''),

  constraint claim_closures_actor_chk
    check (btrim(closed_by_user_id) <> ''),

  constraint claim_closures_summary_chk
    check (btrim(closure_summary) <> ''),

  constraint claim_closures_outcome_chk
    check (final_outcome in (
      'recovered_reconciled',
      'denied_final',
      'closed_without_recovery'
    )),

  constraint claim_closures_recovery_state_chk
    check (
      (
        final_outcome = 'recovered_reconciled'
        and recovery_settlement_id is not null
        and recovery_reconciled_at is not null
      )
      or
      (
        final_outcome in ('denied_final','closed_without_recovery')
        and recovery_settlement_id is null
        and recovery_reconciled_at is null
      )
    ),

  constraint claim_closures_chronology_chk
    check (
      closed_at >= authority_closed_at
      and (
        recovery_reconciled_at is null
        or closed_at >= recovery_reconciled_at
      )
    ),

  constraint claim_closures_row_version_chk
    check (row_version >= 1)
);

create table public.claim_retention_records (
  id text primary key,
  closure_id text not null unique,
  claim_id text not null unique,
  status text not null default 'policy_pending',
  policy_reference text,
  policy_basis text,
  scheduled_at timestamptz,
  retention_until timestamptz,
  pre_hold_status text,
  active_hold_started_at timestamptz,
  active_hold_reason text,
  active_hold_by_user_id text,
  eligible_at timestamptz,
  disposed_at timestamptz,
  disposed_by_user_id text,
  disposition_method text,
  disposition_summary text,
  last_action_by_user_id text not null,
  row_version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint claim_retention_closure_fk
    foreign key (closure_id)
    references public.claim_closures(id)
    on update restrict on delete restrict,

  constraint claim_retention_claim_fk
    foreign key (claim_id)
    references public.claimant_onboarding(claim_id)
    on update restrict on delete restrict,

  constraint claim_retention_id_chk
    check (btrim(id) <> ''),

  constraint claim_retention_actor_chk
    check (btrim(last_action_by_user_id) <> ''),

  constraint claim_retention_status_chk
    check (status in (
      'policy_pending',
      'scheduled',
      'legal_hold',
      'eligible_for_disposition',
      'disposed'
    )),

  constraint claim_retention_pre_hold_chk
    check (
      pre_hold_status is null
      or pre_hold_status in (
        'policy_pending',
        'scheduled',
        'eligible_for_disposition'
      )
    ),

  constraint claim_retention_optional_text_chk
    check (
      (policy_reference is null or btrim(policy_reference) <> '')
      and (policy_basis is null or btrim(policy_basis) <> '')
      and (active_hold_reason is null or btrim(active_hold_reason) <> '')
      and (active_hold_by_user_id is null or btrim(active_hold_by_user_id) <> '')
      and (disposed_by_user_id is null or btrim(disposed_by_user_id) <> '')
      and (disposition_method is null or btrim(disposition_method) <> '')
      and (disposition_summary is null or btrim(disposition_summary) <> '')
    ),

  constraint claim_retention_state_chk
    check (
      (
        status = 'policy_pending'
        and pre_hold_status is null
        and active_hold_started_at is null
        and active_hold_reason is null
        and active_hold_by_user_id is null
        and eligible_at is null
        and disposed_at is null
        and disposed_by_user_id is null
        and disposition_method is null
        and disposition_summary is null
      )
      or
      (
        status = 'scheduled'
        and policy_reference is not null
        and policy_basis is not null
        and scheduled_at is not null
        and retention_until is not null
        and pre_hold_status is null
        and active_hold_started_at is null
        and active_hold_reason is null
        and active_hold_by_user_id is null
        and eligible_at is null
        and disposed_at is null
        and disposed_by_user_id is null
        and disposition_method is null
        and disposition_summary is null
      )
      or
      (
        status = 'legal_hold'
        and pre_hold_status is not null
        and active_hold_started_at is not null
        and active_hold_reason is not null
        and active_hold_by_user_id is not null
        and disposed_at is null
        and disposed_by_user_id is null
        and disposition_method is null
        and disposition_summary is null
      )
      or
      (
        status = 'eligible_for_disposition'
        and policy_reference is not null
        and policy_basis is not null
        and scheduled_at is not null
        and retention_until is not null
        and pre_hold_status is null
        and active_hold_started_at is null
        and active_hold_reason is null
        and active_hold_by_user_id is null
        and eligible_at is not null
        and disposed_at is null
        and disposed_by_user_id is null
        and disposition_method is null
        and disposition_summary is null
      )
      or
      (
        status = 'disposed'
        and policy_reference is not null
        and policy_basis is not null
        and scheduled_at is not null
        and retention_until is not null
        and pre_hold_status is null
        and active_hold_started_at is null
        and active_hold_reason is null
        and active_hold_by_user_id is null
        and eligible_at is not null
        and disposed_at is not null
        and disposed_by_user_id is not null
        and disposition_method is not null
        and disposition_summary is not null
      )
    ),

  constraint claim_retention_chronology_chk
    check (
      (retention_until is null or scheduled_at is not null)
      and (retention_until is null or retention_until >= scheduled_at)
      and (eligible_at is null or retention_until is not null)
      and (eligible_at is null or eligible_at >= retention_until)
      and (disposed_at is null or eligible_at is not null)
      and (disposed_at is null or disposed_at >= eligible_at)
    ),

  constraint claim_retention_row_version_chk
    check (row_version >= 1)
);

create table public.claim_closure_audit (
  id text primary key,
  claim_id text not null,
  closure_id text not null,
  retention_id text,
  action text not null,
  actor_user_id text not null,
  occurred_at timestamptz not null,
  summary text,
  detail jsonb,
  created_at timestamptz not null default now(),

  constraint claim_closure_audit_claim_fk
    foreign key (claim_id)
    references public.claimant_onboarding(claim_id)
    on update restrict on delete restrict,

  constraint claim_closure_audit_closure_fk
    foreign key (closure_id)
    references public.claim_closures(id)
    on update restrict on delete restrict,

  constraint claim_closure_audit_retention_fk
    foreign key (retention_id)
    references public.claim_retention_records(id)
    on update restrict on delete restrict,

  constraint claim_closure_audit_id_chk
    check (btrim(id) <> ''),

  constraint claim_closure_audit_action_chk
    check (action in (
      'claim_final_closed',
      'retention_scheduled',
      'retention_hold_placed',
      'retention_hold_released',
      'retention_eligible',
      'retention_disposed'
    )),

  constraint claim_closure_audit_actor_chk
    check (btrim(actor_user_id) <> ''),

  constraint claim_closure_audit_summary_chk
    check (summary is null or btrim(summary) <> '')
);

create index claim_closures_closed_at_idx
  on public.claim_closures (closed_at desc);

create index claim_retention_status_idx
  on public.claim_retention_records (status, retention_until);

create index claim_closure_audit_claim_idx
  on public.claim_closure_audit (claim_id, occurred_at desc);

alter table public.claim_closures enable row level security;
alter table public.claim_retention_records enable row level security;
alter table public.claim_closure_audit enable row level security;

revoke all on public.claim_closures from public, anon, authenticated;
revoke all on public.claim_retention_records from public, anon, authenticated;
revoke all on public.claim_closure_audit from public, anon, authenticated;

grant select, insert on public.claim_closures to service_role;
grant select, insert, update on public.claim_retention_records to service_role;
grant select, insert on public.claim_closure_audit to service_role;

create or replace function public.guard_claim_closure_insert()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  v_review public.claim_authority_reviews%rowtype;
  v_settlement public.claim_recovery_settlements%rowtype;
begin
  select * into v_review
  from public.claim_authority_reviews
  where id = new.authority_review_id;

  if not found then
    raise exception 'authority review not found for final claim closure'
      using errcode = '23503';
  end if;

  if v_review.claim_id is distinct from new.claim_id
     or v_review.claim_reference is distinct from new.claim_reference then
    raise exception 'final claim closure does not match authority-review provenance'
      using errcode = '42501';
  end if;

  if v_review.status <> 'closed' or v_review.closed_at is null then
    raise exception 'final claim closure requires a closed authority-review lifecycle'
      using errcode = '42501';
  end if;

  if new.authority_closed_at is distinct from v_review.closed_at then
    raise exception 'authority closure timestamp must match the durable authority review'
      using errcode = '42501';
  end if;

  select * into v_settlement
  from public.claim_recovery_settlements
  where claim_id = new.claim_id;

  if found then
    if new.recovery_settlement_id is distinct from v_settlement.id
       or new.recovery_reconciled_at is distinct from v_settlement.reconciled_at then
      raise exception 'final claim closure does not match recovery-settlement provenance'
        using errcode = '42501';
    end if;

    if v_settlement.status <> 'reconciled' or v_settlement.reconciled_at is null then
      raise exception 'recovered claim cannot close finally before recovery reconciliation'
        using errcode = '42501';
    end if;

    if new.final_outcome <> 'recovered_reconciled' then
      raise exception 'reconciled recovery requires recovered_reconciled final outcome'
        using errcode = '42501';
    end if;
  else
    if new.recovery_settlement_id is not null
       or new.recovery_reconciled_at is not null then
      raise exception 'final claim closure cannot reference a nonexistent recovery settlement'
        using errcode = '42501';
    end if;

    if v_review.denial_reason is not null then
      if new.final_outcome <> 'denied_final' then
        raise exception 'denied authority lifecycle requires denied_final outcome'
          using errcode = '42501';
      end if;
    else
      if new.final_outcome <> 'closed_without_recovery' then
        raise exception 'non-recovery authority closure requires closed_without_recovery outcome'
          using errcode = '42501';
      end if;
    end if;
  end if;

  if new.closed_at < v_review.closed_at then
    raise exception 'final claim closure cannot precede authority-review closure'
      using errcode = '22023';
  end if;

  return new;
end;
$$;

create trigger claim_closures_insert_guard
before insert on public.claim_closures
for each row execute function public.guard_claim_closure_insert();

create or replace function public.reject_claim_closure_update_delete()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  raise exception 'final claim closure records are immutable'
    using errcode = '42501';
end;
$$;

create trigger claim_closures_update_guard
before update on public.claim_closures
for each row execute function public.reject_claim_closure_update_delete();

create trigger claim_closures_delete_guard
before delete on public.claim_closures
for each row execute function public.reject_claim_closure_update_delete();

create or replace function public.guard_claim_retention_insert()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  v_closure public.claim_closures%rowtype;
begin
  select * into v_closure
  from public.claim_closures
  where id = new.closure_id;

  if not found then
    raise exception 'claim closure not found for retention record'
      using errcode = '23503';
  end if;

  if new.claim_id is distinct from v_closure.claim_id then
    raise exception 'claim retention record does not match final claim closure'
      using errcode = '42501';
  end if;

  if new.status <> 'policy_pending'
     or new.policy_reference is not null
     or new.policy_basis is not null
     or new.scheduled_at is not null
     or new.retention_until is not null
     or new.pre_hold_status is not null
     or new.active_hold_started_at is not null
     or new.active_hold_reason is not null
     or new.active_hold_by_user_id is not null
     or new.eligible_at is not null
     or new.disposed_at is not null
     or new.disposed_by_user_id is not null
     or new.disposition_method is not null
     or new.disposition_summary is not null then
    raise exception 'new claim retention record must begin policy_pending with no inferred retention schedule'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger claim_retention_insert_guard
before insert on public.claim_retention_records
for each row execute function public.guard_claim_retention_insert();

create or replace function public.guard_claim_retention_update()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if new.id is distinct from old.id
     or new.closure_id is distinct from old.closure_id
     or new.claim_id is distinct from old.claim_id
     or new.created_at is distinct from old.created_at then
    raise exception 'claim retention identity and closure provenance are immutable'
      using errcode = '42501';
  end if;

  if new.status is distinct from old.status then
    if not (
      (old.status = 'policy_pending' and new.status in ('scheduled','legal_hold'))
      or (old.status = 'scheduled' and new.status in ('legal_hold','eligible_for_disposition'))
      or (old.status = 'eligible_for_disposition' and new.status in ('legal_hold','disposed'))
      or (old.status = 'legal_hold' and new.status = old.pre_hold_status)
    ) then
      raise exception 'invalid claim retention transition from % to %', old.status, new.status
        using errcode = '42501';
    end if;
  end if;

  if old.status = 'disposed' then
    raise exception 'disposed claim retention record is terminal'
      using errcode = '42501';
  end if;

  new.row_version := old.row_version + 1;
  new.updated_at := pg_catalog.clock_timestamp();
  return new;
end;
$$;

create trigger claim_retention_update_guard
before update on public.claim_retention_records
for each row execute function public.guard_claim_retention_update();

create or replace function public.reject_claim_retention_delete()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  raise exception 'claim retention records cannot be deleted'
    using errcode = '42501';
end;
$$;

create trigger claim_retention_delete_guard
before delete on public.claim_retention_records
for each row execute function public.reject_claim_retention_delete();

create or replace function public.reject_claim_closure_audit_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  raise exception 'claim closure audit is append-only'
    using errcode = '42501';
end;
$$;

create trigger claim_closure_audit_update_guard
before update on public.claim_closure_audit
for each row execute function public.reject_claim_closure_audit_mutation();

create trigger claim_closure_audit_delete_guard
before delete on public.claim_closure_audit
for each row execute function public.reject_claim_closure_audit_mutation();;
