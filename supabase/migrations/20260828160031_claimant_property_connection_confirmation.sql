alter table public.claimant_onboarding
  add column property_connection_confirmed_at timestamp with time zone null,
  add column property_connection_confirmed_by_user_id uuid null,
  add column property_connection_confirmation_source text null;

alter table public.claimant_onboarding
  add constraint claimant_onboarding_property_connection_confirmed_by_fkey
    foreign key (property_connection_confirmed_by_user_id)
    references public.staff_users(id)
    on update restrict
    on delete restrict,
  add constraint claimant_onboarding_property_connection_confirmation_check
    check (
      (
        property_connection_confirmed_at is null
        and property_connection_confirmed_by_user_id is null
        and property_connection_confirmation_source is null
      )
      or
      (
        property_connection_confirmed_at is not null
        and property_connection_confirmed_by_user_id is not null
        and property_connection_confirmation_source in (
          'phone_call',
          'in_person',
          'video_call',
          'other'
        )
      )
    );

comment on column public.claimant_onboarding.property_connection_confirmed_at is
  'Timestamp when staff recorded that the claimant confirmed their connection to the source property before claimant activation.';

comment on column public.claimant_onboarding.property_connection_confirmed_by_user_id is
  'Persisted staff user who recorded claimant confirmation of the source-property connection.';

comment on column public.claimant_onboarding.property_connection_confirmation_source is
  'Channel through which claimant connection to the source property was confirmed.';;
