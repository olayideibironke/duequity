begin;

create table public.claimant_message_threads (
  id uuid primary key default extensions.gen_random_uuid(),
  claim_id text not null unique references public.claimant_onboarding(claim_id) on update restrict on delete restrict,
  created_by_staff_user_id uuid not null references public.staff_users(id) on update restrict on delete restrict,
  status text not null default 'active' check (status in ('active','closed')),
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.claimant_message_threads is
  'Secure staff-to-claimant conversation threads. One thread per persisted Claim. Claimant identity and human-facing Claimant ID are resolved from claimant_onboarding, never from browser-supplied names.';

create table public.claimant_messages (
  id uuid primary key default extensions.gen_random_uuid(),
  thread_id uuid not null references public.claimant_message_threads(id) on update restrict on delete restrict,
  reply_to_message_id uuid references public.claimant_messages(id) on update restrict on delete restrict,
  sender_type text not null check (sender_type in ('staff','claimant')),
  sender_staff_user_id uuid references public.staff_users(id) on update restrict on delete restrict,
  sender_claimant_auth_user_id uuid references auth.users(id) on update cascade on delete restrict,
  body_text text not null default '',
  state text not null default 'draft' check (state in ('draft','sent')),
  sent_at timestamptz,
  claimant_read_at timestamptz,
  staff_read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint claimant_messages_sender_shape_check check (
    (sender_type = 'staff' and sender_staff_user_id is not null and sender_claimant_auth_user_id is null)
    or
    (sender_type = 'claimant' and sender_staff_user_id is null and sender_claimant_auth_user_id is not null)
  ),
  constraint claimant_messages_state_timestamp_check check (
    (state = 'draft' and sent_at is null)
    or
    (state = 'sent' and sent_at is not null)
  ),
  constraint claimant_messages_directional_read_check check (
    (sender_type = 'staff' and staff_read_at is null)
    or
    (sender_type = 'claimant' and claimant_read_at is null)
  )
);

comment on table public.claimant_messages is
  'Secure claimant-facing messages. Internal DueQuity staff mail is a separate repository and must never be copied into this table automatically.';

create table public.claimant_message_attachments (
  id uuid primary key default extensions.gen_random_uuid(),
  message_id uuid not null references public.claimant_messages(id) on update restrict on delete restrict,
  uploader_type text not null check (uploader_type in ('staff','claimant')),
  uploaded_by_staff_user_id uuid references public.staff_users(id) on update restrict on delete restrict,
  uploaded_by_claimant_auth_user_id uuid references auth.users(id) on update cascade on delete restrict,
  storage_path text not null unique check (btrim(storage_path) <> ''),
  file_name text not null check (btrim(file_name) <> ''),
  mime_type text not null check (
    mime_type in (
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/csv',
      'text/plain',
      'image/jpeg',
      'image/png',
      'image/webp'
    )
  ),
  size_bytes bigint not null check (size_bytes >= 0 and size_bytes <= 26214400),
  created_at timestamptz not null default now(),
  constraint claimant_message_attachments_uploader_shape_check check (
    (uploader_type = 'staff' and uploaded_by_staff_user_id is not null and uploaded_by_claimant_auth_user_id is null)
    or
    (uploader_type = 'claimant' and uploaded_by_staff_user_id is null and uploaded_by_claimant_auth_user_id is not null)
  )
);

comment on table public.claimant_message_attachments is
  'Private attachments for secure claimant-facing messages. Identity evidence and other claim-submission documents should continue to use the dedicated claim document workflow.';

create index claimant_message_threads_last_message_idx
  on public.claimant_message_threads(last_message_at desc nulls last);

create index claimant_messages_thread_sent_idx
  on public.claimant_messages(thread_id, sent_at desc nulls last, created_at desc);

create index claimant_messages_staff_unread_idx
  on public.claimant_messages(thread_id, sent_at desc)
  where state = 'sent' and sender_type = 'claimant' and staff_read_at is null;

create index claimant_messages_claimant_unread_idx
  on public.claimant_messages(thread_id, sent_at desc)
  where state = 'sent' and sender_type = 'staff' and claimant_read_at is null;

create index claimant_message_attachments_message_idx
  on public.claimant_message_attachments(message_id, created_at);

alter table public.claimant_message_threads enable row level security;
alter table public.claimant_messages enable row level security;
alter table public.claimant_message_attachments enable row level security;

revoke all on table public.claimant_message_threads from public, anon, authenticated;
revoke all on table public.claimant_messages from public, anon, authenticated;
revoke all on table public.claimant_message_attachments from public, anon, authenticated;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'claimant-message-attachments',
  'claimant-message-attachments',
  false,
  26214400,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv',
    'text/plain',
    'image/jpeg',
    'image/png',
    'image/webp'
  ]::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

commit;;
