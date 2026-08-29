create table public.contact_inquiries (
  id uuid primary key default extensions.gen_random_uuid(),
  reference text not null unique,
  source text not null default 'website_form' check (source = any (array['website_form'::text, 'direct_email'::text, 'staff_created'::text])),
  status text not null default 'new' check (status = any (array['new'::text, 'open'::text, 'awaiting_response'::text, 'responded'::text, 'closed'::text, 'spam'::text])),
  category text not null default 'general' check (category = any (array['general'::text, 'claim_question'::text, 'partnership'::text, 'media'::text, 'other'::text])),
  requester_name text not null check (btrim(requester_name) <> ''::text),
  requester_email text not null check (btrim(requester_email) <> ''::text and position('@'::text in requester_email) > 1),
  requester_phone text null,
  subject text not null check (btrim(subject) <> ''::text),
  assigned_to_staff_user_id uuid null references public.staff_users(id) on delete set null,
  last_message_at timestamp with time zone not null default clock_timestamp(),
  closed_at timestamp with time zone null,
  row_version bigint not null default 1 check (row_version >= 1),
  created_at timestamp with time zone not null default clock_timestamp(),
  updated_at timestamp with time zone not null default clock_timestamp()
);

comment on table public.contact_inquiries is 'DueQuity public contact and general-inquiry case record. This is isolated from claimant, opportunity, claim, document, and internal staff-mail repositories.';
comment on column public.contact_inquiries.assigned_to_staff_user_id is 'Optional staff owner for the inquiry. Application policy restricts operational access to the communications role and owner-level oversight.';

create table public.contact_inquiry_messages (
  id uuid primary key default extensions.gen_random_uuid(),
  inquiry_id uuid not null references public.contact_inquiries(id) on delete restrict,
  reply_to_message_id uuid null references public.contact_inquiry_messages(id) on delete set null,
  direction text not null check (direction = any (array['inbound'::text, 'outbound'::text, 'internal'::text])),
  channel text not null check (channel = any (array['website_form'::text, 'email'::text, 'internal_note'::text])),
  sender_type text not null check (sender_type = any (array['public'::text, 'staff'::text, 'system'::text])),
  sender_name text not null check (btrim(sender_name) <> ''::text),
  sender_email text null,
  sender_staff_user_id uuid null references public.staff_users(id) on delete set null,
  body_text text not null check (btrim(body_text) <> ''::text),
  state text not null default 'received' check (state = any (array['received'::text, 'draft'::text, 'sent'::text, 'failed'::text])),
  external_message_id text null,
  sent_at timestamp with time zone null,
  created_at timestamp with time zone not null default clock_timestamp(),
  check (
    (sender_type = 'staff'::text and sender_staff_user_id is not null)
    or
    (sender_type <> 'staff'::text and sender_staff_user_id is null)
  )
);

comment on table public.contact_inquiry_messages is 'Message history for public DueQuity contact inquiries. It is not claimant secure messaging and not internal staff mail.';

create index contact_inquiries_status_created_idx
  on public.contact_inquiries (status, created_at desc);

create index contact_inquiries_assigned_idx
  on public.contact_inquiries (assigned_to_staff_user_id, status, updated_at desc);

create index contact_inquiry_messages_inquiry_created_idx
  on public.contact_inquiry_messages (inquiry_id, created_at asc);

alter table public.contact_inquiries enable row level security;
alter table public.contact_inquiries force row level security;
alter table public.contact_inquiry_messages enable row level security;
alter table public.contact_inquiry_messages force row level security;

revoke all on table public.contact_inquiries from public, anon, authenticated;
revoke all on table public.contact_inquiry_messages from public, anon, authenticated;;
