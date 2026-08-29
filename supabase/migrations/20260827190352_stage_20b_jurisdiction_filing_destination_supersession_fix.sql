begin;

alter table public.jurisdiction_filing_destinations
drop constraint
  jurisdiction_filing_destinati_superseded_by_destination_id_fkey;

alter table public.jurisdiction_filing_destinations
add constraint
  jurisdiction_filing_destinations_supersession_fkey
foreign key (
  superseded_by_destination_id
)
references public.jurisdiction_filing_destinations(id)
on update restrict
on delete restrict
deferrable initially deferred;

commit;;
