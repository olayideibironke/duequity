begin;

do $$
declare
  verifier_id uuid;
  verifier_count integer;

  package_jurisdiction_id text;
begin
  select count(*)
  into verifier_count
  from public.staff_users
  where lower(email) =
        lower('invest@westforgeholdings.com')
    and status = 'active';

  if verifier_count <> 1 then
    raise exception
      'Exactly one active staff account for invest@westforgeholdings.com is required to verify the Carroll filing destination';
  end if;

  select id
  into verifier_id
  from public.staff_users
  where lower(email) =
        lower('invest@westforgeholdings.com')
    and status = 'active'
  limit 1;

  if verifier_id is null then
    raise exception
      'The active Administrator account invest@westforgeholdings.com could not be resolved';
  end if;

  select jurisdiction_id
  into package_jurisdiction_id
  from public.jurisdiction_rule_packages
  where package_id =
          'jurpkg-24-24013-tax_lien_foreclosure'
    and version = 1
    and status = 'approved';

  if package_jurisdiction_id is null then
    raise exception
      'Approved Carroll County jurisdiction package version 1 could not be resolved';
  end if;

  insert into public.jurisdiction_filing_destinations (
    id,
    jurisdiction_package_id,
    jurisdiction_package_version,
    jurisdiction_id,
    destination_version,
    status,
    submission_method,
    agency_name,
    department_name,
    attention_line,
    filing_email,
    mailing_address,
    physical_address,
    portal_url,
    phone,
    filing_instructions,
    official_source_url,
    official_source_title,
    evidence_note,
    verified_by_user_id,
    verified_at,
    superseded_at,
    superseded_by_destination_id
  )
  values (
    'jfd-carroll-tax-sale-surplus-email-v1',
    'jurpkg-24-24013-tax_lien_foreclosure',
    1,
    package_jurisdiction_id,
    1,
    'verified',
    'email',
    'Carroll County Government',
    'Collections/Tax Office',
    'Surplus Funds Claim',
    'cctaxoffice@carrollcountymd.gov',
    null,
    null,
    null,
    '410-386-2971',
    array[
      'Submit the claimant-ready surplus-funds package to the Carroll County Tax Office filing email.',
      'The filing must remain under the claimant or lawful estate representative''s control because the approved jurisdiction package records representative_may_file = no.',
      'Do not identify DueQuity as the filer.',
      'Carroll County does not identify a separate special county claim form for this recovery route.',
      'Include the jurisdiction-required accepted identity evidence in the claimant-ready package.'
    ]::text[],
    'https://www.carrollcountymd.gov/government/directory/comptroller/frequently-asked-questions-comptroller/',
    'Frequently Asked Questions regarding the Surplus Funds List',
    'Official Carroll County guidance identifies cctaxoffice@carrollcountymd.gov and 410-386-2971 as the Tax Office contact for submitting a surplus-funds claim. The approved DueQuity jurisdiction package independently controls the claimant-only filing route and prohibits recording DueQuity as the filer.',
    verifier_id,
    clock_timestamp(),
    null,
    null
  );

end
$$;

commit;