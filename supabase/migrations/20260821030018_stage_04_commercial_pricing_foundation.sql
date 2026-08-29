create table public.commercial_fee_policies (
  id text primary key check (btrim(id)<>''),
  jurisdiction_id text not null check (btrim(jurisdiction_id)<>''),
  version bigint not null check (version>=1),
  sale_types text[],
  custodians text[],
  status text not null default 'draft' check (status in ('draft','approved','paused','retired')),
  effective_from date not null,
  effective_through date,
  tiers jsonb not null check (jsonb_typeof(tiers)='array' and jsonb_array_length(tiers)>0),
  approved_by_user_id text,
  approved_at timestamptz,
  last_reviewed_at date,
  review_due_at date,
  internal_notes text,
  row_version bigint not null default 1 check (row_version>=1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (jurisdiction_id,version),
  unique (id,version),
  check (effective_through is null or effective_through>=effective_from),
  check ((status='approved' and approved_by_user_id is not null and btrim(approved_by_user_id)<>'' and approved_at is not null) or status<>'approved')
);
comment on table public.commercial_fee_policies is 'DueQuity commercial pricing policy, separate from legal fee ceilings. No nationwide fallback policy exists. Approved versions are immutable historical pricing decisions.';

create index commercial_fee_policies_jurisdiction_idx on public.commercial_fee_policies(jurisdiction_id,version desc);
create index commercial_fee_policies_status_idx on public.commercial_fee_policies(status,effective_from desc);

create table public.commercial_fee_quotes (
  quote_id text primary key check (btrim(quote_id)<>''),
  opportunity_id text not null check (btrim(opportunity_id)<>''),
  jurisdiction_id text not null check (btrim(jurisdiction_id)<>''),
  commercial_policy_id text not null check (btrim(commercial_policy_id)<>''),
  commercial_policy_version bigint not null check (commercial_policy_version>=1),
  commercial_tier_id text not null check (btrim(commercial_tier_id)<>''),
  quote_snapshot jsonb not null check (jsonb_typeof(quote_snapshot)='object'),
  snapshot_hash text not null check (snapshot_hash ~ '^[0-9a-f]{64}$'),
  recovery_amount_cents bigint not null check (recovery_amount_cents>=0),
  recovery_basis text not null check (recovery_basis in ('estimated','confirmed')),
  fee_model text not null check (fee_model in ('flat','percentage','capped_success','no_fee')),
  selected_percentage numeric(9,8) check (selected_percentage is null or selected_percentage between 0 and 1),
  selected_flat_amount_cents bigint check (selected_flat_amount_cents is null or selected_flat_amount_cents>=0),
  projected_fee_cents bigint not null check (projected_fee_cents>=0),
  projected_claimant_net_cents bigint not null check (projected_claimant_net_cents>=0),
  legal_rule_version_snapshot bigint check (legal_rule_version_snapshot is null or legal_rule_version_snapshot>=1),
  legal_fee_cap_percent_snapshot numeric(9,8) check (legal_fee_cap_percent_snapshot is null or legal_fee_cap_percent_snapshot between 0 and 1),
  legal_fee_cap_amount_snapshot_cents bigint check (legal_fee_cap_amount_snapshot_cents is null or legal_fee_cap_amount_snapshot_cents>=0),
  commercial_staff_floor_percent_snapshot numeric(9,8) check (commercial_staff_floor_percent_snapshot is null or commercial_staff_floor_percent_snapshot between 0 and 1),
  commercial_staff_ceiling_percent_snapshot numeric(9,8) check (commercial_staff_ceiling_percent_snapshot is null or commercial_staff_ceiling_percent_snapshot between 0 and 1),
  commercial_manager_ceiling_percent_snapshot numeric(9,8) check (commercial_manager_ceiling_percent_snapshot is null or commercial_manager_ceiling_percent_snapshot between 0 and 1),
  commercial_staff_floor_amount_snapshot_cents bigint check (commercial_staff_floor_amount_snapshot_cents is null or commercial_staff_floor_amount_snapshot_cents>=0),
  commercial_staff_ceiling_amount_snapshot_cents bigint check (commercial_staff_ceiling_amount_snapshot_cents is null or commercial_staff_ceiling_amount_snapshot_cents>=0),
  commercial_manager_ceiling_amount_snapshot_cents bigint check (commercial_manager_ceiling_amount_snapshot_cents is null or commercial_manager_ceiling_amount_snapshot_cents>=0),
  internal_fee_cap_amount_snapshot_cents bigint check (internal_fee_cap_amount_snapshot_cents is null or internal_fee_cap_amount_snapshot_cents>=0),
  minimum_viable_fee_snapshot_cents bigint check (minimum_viable_fee_snapshot_cents is null or minimum_viable_fee_snapshot_cents>=0),
  viability_status text not null check (viability_status in ('not_evaluated','viable','manager_review','below_minimum_revenue','declined')),
  approval_status text not null check (approval_status in ('draft','staff_approved','manager_review','manager_approved','rejected','locked')),
  approval_reason text,
  approved_by_user_id text,
  approved_at timestamptz,
  manager_reviewed_by_user_id text,
  manager_reviewed_at timestamptz,
  rejected_by_user_id text,
  rejected_at timestamptz,
  rejection_reason text,
  locked_fee_agreement_id text,
  locked_at timestamptz,
  created_by_user_id text not null check (btrim(created_by_user_id)<>''),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  row_version bigint not null default 1 check (row_version>=1),
  foreign key (commercial_policy_id,commercial_policy_version) references public.commercial_fee_policies(id,version) on update restrict on delete restrict,
  check (projected_fee_cents<=recovery_amount_cents),
  check (projected_claimant_net_cents = recovery_amount_cents-projected_fee_cents),
  check ((approval_status='locked' and locked_fee_agreement_id is not null and btrim(locked_fee_agreement_id)<>'' and locked_at is not null) or approval_status<>'locked'),
  check (approval_status not in ('staff_approved','manager_approved','locked') or legal_rule_version_snapshot is not null)
);
comment on table public.commercial_fee_quotes is 'Case-specific commercial quote. quote_snapshot and snapshot_hash are immutable calculation provenance; approval metadata may advance under optimistic concurrency until locked.';

create index commercial_fee_quotes_opportunity_idx on public.commercial_fee_quotes(opportunity_id,updated_at desc);
create index commercial_fee_quotes_policy_fk_idx on public.commercial_fee_quotes(commercial_policy_id,commercial_policy_version);
create index commercial_fee_quotes_status_idx on public.commercial_fee_quotes(approval_status,updated_at desc);

create table public.commercial_fee_quote_audit (
  id text primary key check (btrim(id)<>''),
  quote_id text not null references public.commercial_fee_quotes(quote_id) on update restrict on delete restrict,
  opportunity_id text not null check (btrim(opportunity_id)<>''),
  action text not null check (action in ('quote_saved','staff_approved','manager_review_requested','manager_approved','quote_rejected','quote_locked')),
  actor_user_id text not null check (btrim(actor_user_id)<>''),
  occurred_at timestamptz not null,
  previous_status text check (previous_status is null or previous_status in ('draft','staff_approved','manager_review','manager_approved','rejected','locked')),
  next_status text not null check (next_status in ('draft','staff_approved','manager_review','manager_approved','rejected','locked')),
  commercial_policy_id text not null,
  commercial_policy_version bigint not null check (commercial_policy_version>=1),
  legal_rule_version_snapshot bigint check (legal_rule_version_snapshot is null or legal_rule_version_snapshot>=1),
  snapshot_hash text not null check (snapshot_hash ~ '^[0-9a-f]{64}$'),
  reason text,
  foreign key (commercial_policy_id,commercial_policy_version) references public.commercial_fee_policies(id,version) on update restrict on delete restrict
);
comment on table public.commercial_fee_quote_audit is 'Append-only commercial quote lifecycle audit. Material production actions must also feed public.audit_events in the same server transaction where feasible.';

create index commercial_fee_quote_audit_quote_idx on public.commercial_fee_quote_audit(quote_id,occurred_at desc);
create index commercial_fee_quote_audit_policy_fk_idx on public.commercial_fee_quote_audit(commercial_policy_id,commercial_policy_version);

create or replace function public.guard_commercial_fee_policy_update()
returns trigger language plpgsql set search_path=pg_catalog as $$
begin
  if old.status <> 'draft' then
    raise exception 'approved, paused, or retired commercial policy versions are immutable; create a new version' using errcode='42501';
  end if;
  if new.id is distinct from old.id or new.jurisdiction_id is distinct from old.jurisdiction_id or new.version is distinct from old.version or new.created_at is distinct from old.created_at then
    raise exception 'commercial policy identity/version is immutable' using errcode='42501';
  end if;
  new.row_version := old.row_version+1;
  new.updated_at := pg_catalog.clock_timestamp();
  return new;
end;$$;

create or replace function public.guard_commercial_fee_quote_update()
returns trigger language plpgsql set search_path=pg_catalog as $$
begin
  if old.approval_status='locked' then
    raise exception 'a commercial quote locked to an agreement is immutable' using errcode='42501';
  end if;
  if new.quote_id is distinct from old.quote_id
     or new.opportunity_id is distinct from old.opportunity_id
     or new.jurisdiction_id is distinct from old.jurisdiction_id
     or new.commercial_policy_id is distinct from old.commercial_policy_id
     or new.commercial_policy_version is distinct from old.commercial_policy_version
     or new.commercial_tier_id is distinct from old.commercial_tier_id
     or new.quote_snapshot is distinct from old.quote_snapshot
     or new.snapshot_hash is distinct from old.snapshot_hash
     or new.recovery_amount_cents is distinct from old.recovery_amount_cents
     or new.recovery_basis is distinct from old.recovery_basis
     or new.fee_model is distinct from old.fee_model
     or new.selected_percentage is distinct from old.selected_percentage
     or new.selected_flat_amount_cents is distinct from old.selected_flat_amount_cents
     or new.projected_fee_cents is distinct from old.projected_fee_cents
     or new.projected_claimant_net_cents is distinct from old.projected_claimant_net_cents
     or new.legal_rule_version_snapshot is distinct from old.legal_rule_version_snapshot
     or new.legal_fee_cap_percent_snapshot is distinct from old.legal_fee_cap_percent_snapshot
     or new.legal_fee_cap_amount_snapshot_cents is distinct from old.legal_fee_cap_amount_snapshot_cents
     or new.created_by_user_id is distinct from old.created_by_user_id
     or new.created_at is distinct from old.created_at then
    raise exception 'commercial quote calculation/snapshot is immutable' using errcode='42501';
  end if;
  new.row_version := old.row_version+1;
  new.updated_at := pg_catalog.clock_timestamp();
  return new;
end;$$;

create or replace function public.reject_append_only_commercial_audit_mutation()
returns trigger language plpgsql set search_path=pg_catalog as $$ begin raise exception 'commercial fee quote audit is append-only' using errcode='42501'; end; $$;

create trigger commercial_policy_guard_update before update on public.commercial_fee_policies for each row execute function public.guard_commercial_fee_policy_update();
create trigger commercial_quote_guard_update before update on public.commercial_fee_quotes for each row execute function public.guard_commercial_fee_quote_update();
create trigger commercial_quote_audit_reject_update_delete before update or delete on public.commercial_fee_quote_audit for each row execute function public.reject_append_only_commercial_audit_mutation();
create trigger commercial_quote_audit_reject_truncate before truncate on public.commercial_fee_quote_audit for each statement execute function public.reject_append_only_commercial_audit_mutation();

alter table public.commercial_fee_policies enable row level security;
alter table public.commercial_fee_quotes enable row level security;
alter table public.commercial_fee_quote_audit enable row level security;
revoke all privileges on table public.commercial_fee_policies,public.commercial_fee_quotes,public.commercial_fee_quote_audit from public,anon,authenticated;
revoke all privileges on table public.commercial_fee_policies from service_role;
grant select,insert,update on table public.commercial_fee_policies to service_role;
revoke delete,truncate on table public.commercial_fee_policies from service_role;
revoke all privileges on table public.commercial_fee_quotes from service_role;
grant select,insert,update on table public.commercial_fee_quotes to service_role;
revoke delete,truncate on table public.commercial_fee_quotes from service_role;
revoke all privileges on table public.commercial_fee_quote_audit from service_role;
grant select,insert on table public.commercial_fee_quote_audit to service_role;
revoke update,delete,truncate on table public.commercial_fee_quote_audit from service_role;

revoke execute on function public.guard_commercial_fee_policy_update() from public,anon,authenticated,service_role;
revoke execute on function public.guard_commercial_fee_quote_update() from public,anon,authenticated,service_role;
revoke execute on function public.reject_append_only_commercial_audit_mutation() from public,anon,authenticated,service_role;;
