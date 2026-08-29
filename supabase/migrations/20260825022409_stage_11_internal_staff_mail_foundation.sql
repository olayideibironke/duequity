create table public.staff_mail_messages (
  id uuid primary key default extensions.gen_random_uuid(),
  thread_id uuid not null default extensions.gen_random_uuid(),
  sender_staff_user_id uuid not null references public.staff_users(id) on delete restrict,
  reply_to_message_id uuid null references public.staff_mail_messages(id) on delete set null,
  subject text not null default '',
  body_text text not null default '',
  priority text not null default 'normal' check (priority in ('normal','high')),
  state text not null default 'draft' check (state in ('draft','sent')),
  acknowledgment_requested boolean not null default false,
  sent_at timestamptz null,
  sender_archived_at timestamptz null,
  sender_trashed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (state = 'draft' and sent_at is null)
    or
    (state = 'sent' and sent_at is not null)
  )
);

create table public.staff_mail_recipients (
  id uuid primary key default extensions.gen_random_uuid(),
  message_id uuid not null references public.staff_mail_messages(id) on delete cascade,
  staff_user_id uuid not null references public.staff_users(id) on delete restrict,
  recipient_type text not null check (recipient_type in ('to','cc','bcc')),
  read_at timestamptz null,
  archived_at timestamptz null,
  trashed_at timestamptz null,
  acknowledged_at timestamptz null,
  created_at timestamptz not null default now(),
  unique (message_id, staff_user_id)
);

create table public.staff_mail_attachments (
  id uuid primary key default extensions.gen_random_uuid(),
  message_id uuid not null references public.staff_mail_messages(id) on delete cascade,
  uploaded_by_staff_user_id uuid not null references public.staff_users(id) on delete restrict,
  storage_path text not null unique,
  file_name text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  created_at timestamptz not null default now(),
  check (btrim(storage_path) <> ''),
  check (btrim(file_name) <> ''),
  check (btrim(mime_type) <> '')
);

create index staff_mail_messages_sender_state_idx
  on public.staff_mail_messages (sender_staff_user_id, state, sent_at desc nulls last, created_at desc);

create index staff_mail_messages_thread_idx
  on public.staff_mail_messages (thread_id, sent_at asc nulls last, created_at asc);

create index staff_mail_recipients_mailbox_idx
  on public.staff_mail_recipients (staff_user_id, trashed_at, archived_at, read_at, created_at desc);

create index staff_mail_recipients_message_idx
  on public.staff_mail_recipients (message_id);

create index staff_mail_attachments_message_idx
  on public.staff_mail_attachments (message_id, created_at);

alter table public.staff_mail_messages enable row level security;
alter table public.staff_mail_recipients enable row level security;
alter table public.staff_mail_attachments enable row level security;

revoke all on table public.staff_mail_messages from public, anon, authenticated;
revoke all on table public.staff_mail_recipients from public, anon, authenticated;
revoke all on table public.staff_mail_attachments from public, anon, authenticated;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'staff-mail-attachments',
  'staff-mail-attachments',
  false,
  26214400,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'text/csv',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'text/plain',
    'image/jpeg',
    'image/png',
    'image/webp'
  ]::text[]
)
on conflict (id) do update
set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;;
