alter table public.discovered_records
  alter column address_line1 drop not null,
  alter column city drop not null,
  alter column sale_date drop not null;
;
