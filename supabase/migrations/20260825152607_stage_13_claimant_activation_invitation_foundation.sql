create table public.claimant_activation_invitations (
  id uuid primary key default gen_random_uuid(),
  claim_id text not null references public.claimant_onboarding(claim_id) on update restrict on delete restrict,
  claimant_id text not null,
  claimant_reference text not null,
  legal_first_name text not null,
  legal_last_name text not null,
  email text not null,
  mobile_phone text not null,
  auth_user_id uuid null references auth.users(id) on update cascade on delete set null,
  status text not null default 'preparing' check (status in ('preparing','sent','activated','revoked','failed','expired')),
  sent_by_staff_user_id uuid not null references public.staff_users(id) on update restrict on delete restrict,
  sent_at timestamptz null,
  activated_at timestamptz null,
  revoked_at timestamptz null,
  expires_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint claimant_activation_invitations_claimant_id_check check (btrim(claimant_id) <> ''),
  constraint claimant_activation_invitations_claimant_reference_check check (btrim(claimant_reference) <> ''),
  constraint claimant_activation_invitations_first_name_check check (btrim(legal_first_name) <> ''),
  constraint claimant_activation_invitations_last_name_check check (btrim(legal_last_name) <> ''),
  constraint claimant_activation_invitations_email_check check (btrim(email) <> '' and position('@' in email) > 1),
  constraint claimant_activation_invitations_mobile_check check (mobile_phone ~ '^[0-9]{10}$'),
  constraint claimant_activation_invitations_expiry_check check (expires_at > created_at),
  constraint claimant_activation_invitations_status_shape_check check (
    (status = 'preparing' and sent_at is null and activated_at is null and revoked_at is null)
    or (status = 'sent' and sent_at is not null and activated_at is null and revoked_at is null)
    or (status = 'activated' and sent_at is not null and activated_at is not null and revoked_at is null)
    or (status = 'revoked' and revoked_at is not null)
    or (status = 'failed' and activated_at is null)
    or (status = 'expired' and activated_at is null)
  )
);

create unique index claimant_activation_invitations_one_open_per_claim
  on public.claimant_activation_invitations(claim_id)
  where status in ('preparing','sent');

create index claimant_activation_invitations_claimant_id_idx
  on public.claimant_activation_invitations(claimant_id);

create index claimant_activation_invitations_email_idx
  on public.claimant_activation_invitations(lower(email));

alter table public.claimant_activation_invitations enable row level security;
revoke all on public.claimant_activation_invitations from public, anon, authenticated;

grant all on public.claimant_activation_invitations to service_role;

comment on table public.claimant_activation_invitations is
'Staff-issued claimant account activation invitation history. Claimant identity is established by the persisted onboarding record and staff-confirmed legal name; passwords are never stored here.';

alter table public.claim_documents
  add column government_id_type text null;

alter table public.claim_documents
  add constraint claim_documents_government_id_type_check
  check (
    (kind = 'government_id' and government_id_type in ('drivers_license','us_passport','state_id','other_government_photo_id'))
    or (kind <> 'government_id' and government_id_type is null)
  );

comment on column public.claim_documents.government_id_type is
'Government ID subtype selected by the claimant for restricted identity evidence. No ID number is stored.';;
