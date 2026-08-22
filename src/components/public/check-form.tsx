"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  AddressAutocomplete,
  type AddressSelection,
} from "@/components/public/address-autocomplete";
import { Button } from "@/components/ui/button";
import { SelectField, TextField } from "@/components/ui/field";
import { IconSearch } from "@/components/ui/icon";

/**
 * PROPERTY SEARCH FORM
 *
 * Public property search is national.
 *
 * A property may exist in a jurisdiction where Duequity has not yet been
 * approved to accept claims. The search form therefore allows every U.S.
 * state and DC rather than limiting the user to currently active
 * jurisdictions.
 *
 * Jurisdiction compliance is evaluated after a record is identified.
 */

const US_STATES = [
  { value: "", label: "Any U.S. state" },
  { value: "AL", label: "Alabama" },
  { value: "AK", label: "Alaska" },
  { value: "AZ", label: "Arizona" },
  { value: "AR", label: "Arkansas" },
  { value: "CA", label: "California" },
  { value: "CO", label: "Colorado" },
  { value: "CT", label: "Connecticut" },
  { value: "DE", label: "Delaware" },
  { value: "DC", label: "District of Columbia" },
  { value: "FL", label: "Florida" },
  { value: "GA", label: "Georgia" },
  { value: "HI", label: "Hawaii" },
  { value: "ID", label: "Idaho" },
  { value: "IL", label: "Illinois" },
  { value: "IN", label: "Indiana" },
  { value: "IA", label: "Iowa" },
  { value: "KS", label: "Kansas" },
  { value: "KY", label: "Kentucky" },
  { value: "LA", label: "Louisiana" },
  { value: "ME", label: "Maine" },
  { value: "MD", label: "Maryland" },
  { value: "MA", label: "Massachusetts" },
  { value: "MI", label: "Michigan" },
  { value: "MN", label: "Minnesota" },
  { value: "MS", label: "Mississippi" },
  { value: "MO", label: "Missouri" },
  { value: "MT", label: "Montana" },
  { value: "NE", label: "Nebraska" },
  { value: "NV", label: "Nevada" },
  { value: "NH", label: "New Hampshire" },
  { value: "NJ", label: "New Jersey" },
  { value: "NM", label: "New Mexico" },
  { value: "NY", label: "New York" },
  { value: "NC", label: "North Carolina" },
  { value: "ND", label: "North Dakota" },
  { value: "OH", label: "Ohio" },
  { value: "OK", label: "Oklahoma" },
  { value: "OR", label: "Oregon" },
  { value: "PA", label: "Pennsylvania" },
  { value: "RI", label: "Rhode Island" },
  { value: "SC", label: "South Carolina" },
  { value: "SD", label: "South Dakota" },
  { value: "TN", label: "Tennessee" },
  { value: "TX", label: "Texas" },
  { value: "UT", label: "Utah" },
  { value: "VT", label: "Vermont" },
  { value: "VA", label: "Virginia" },
  { value: "WA", label: "Washington" },
  { value: "WV", label: "West Virginia" },
  { value: "WI", label: "Wisconsin" },
  { value: "WY", label: "Wyoming" },
];

const STATE_NAME_TO_CODE = Object.fromEntries(
  US_STATES.filter((state) => state.value).map((state) => [
    state.label.toUpperCase(),
    state.value,
  ]),
);

function normalizeState(value?: string) {
  if (!value) {
    return "";
  }

  const normalized = value.trim().toUpperCase();

  if (US_STATES.some((state) => state.value === normalized)) {
    return normalized;
  }

  return STATE_NAME_TO_CODE[normalized] ?? "";
}

export function CheckForm({
  initial,
}: {
  initial: {
    address?: string;
    ownerName?: string;
    state?: string;
    county?: string;
  };
}) {
  const router = useRouter();

  const [address, setAddress] = useState(initial.address ?? "");
  const [ownerName, setOwnerName] = useState(initial.ownerName ?? "");
  const [state, setState] = useState(initial.state ?? "");
  const [county, setCounty] = useState(initial.county ?? "");
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  function handleAddressChange(nextAddress: string) {
    setAddress(nextAddress);
  }

  function handleAddressSelect(selection: AddressSelection) {
    setAddress(selection.fullAddress);

    const selectedState = normalizeState(selection.state);

    if (selectedState) {
      setState(selectedState);
    } else {
      setState("");
    }

    if (selection.county) {
      setCounty(selection.county);
    } else {
      setCounty("");
    }
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    if (
      !address.trim() &&
      !ownerName.trim() &&
      !state.trim() &&
      !county.trim()
    ) {
      setError(
        "Enter a property address, a former owner name, or a county to search.",
      );
      return;
    }

    setError(undefined);
    setPending(true);

    const params = new URLSearchParams();

    if (address.trim()) {
      params.set("address", address.trim());
    }

    if (ownerName.trim()) {
      params.set("owner", ownerName.trim());
    }

    if (state.trim()) {
      params.set("state", state.trim());
    }

    if (county.trim()) {
      params.set("county", county.trim());
    }

    router.push(`/check?${params.toString()}`);

    setTimeout(() => setPending(false), 1200);
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <fieldset>
        <legend className="text-base font-semibold text-ink-900">
          Search for a property
        </legend>

        <p className="mt-1 text-sm text-ink-600">
          You do not need all of these. An address or a name is enough, and a
          partial one often works.
        </p>

        <div className="mt-5 space-y-5">
          <AddressAutocomplete
            label="Property address"
            value={address}
            onChange={handleAddressChange}
            onSelect={handleAddressSelect}
            placeholder="Start typing the property address"
            hint="The address of the property that was sold, not your current address."
          />

          <TextField
            label="Former owner name"
            value={ownerName}
            onChange={(event) => setOwnerName(event.target.value)}
            placeholder="Name as it appeared on the deed"
            autoComplete="off"
            hint="Include a maiden name or a business name if the property was held that way."
          />

          <div className="grid gap-5 sm:grid-cols-2">
            <SelectField
              label="State"
              value={state}
              onChange={(event) => setState(event.target.value)}
              options={US_STATES}
            />

            <TextField
              label="County"
              value={county}
              onChange={(event) => setCounty(event.target.value)}
              placeholder="Optional"
              autoComplete="off"
            />
          </div>
        </div>

        {error && (
          <p
            role="alert"
            className="mt-4 text-sm font-medium text-critical-700"
          >
            {error}
          </p>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-line-subtle pt-5">
          <Button
            type="submit"
            variant="primary"
            accent
            size="lg"
            loading={pending}
            leading={<IconSearch size={17} />}
          >
            Search records
          </Button>

          <p className="text-xs text-ink-500">
            Free. No account needed. No Social Security number requested.
          </p>
        </div>
      </fieldset>
    </form>
  );
}
