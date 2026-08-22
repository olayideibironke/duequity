"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Field } from "@/components/ui/field";
import { IconSearch } from "@/components/ui/icon";
import { cn } from "@/lib/cn";

interface GeoapifySuggestion {
  name?: string;
  country?: string;
  country_code?: string;
  state?: string;
  state_code?: string;
  county?: string;
  county_code?: string;
  postcode?: string;
  city?: string;
  street?: string;
  housenumber?: string;
  formatted?: string;
  address_line1?: string;
  address_line2?: string;
  result_type?: string;
  place_id?: string;
  lat?: number;
  lon?: number;
}

interface GeoapifyResponse {
  results?: GeoapifySuggestion[];
}

export interface AddressSelection {
  fullAddress: string;
  placeId: string;
  state?: string;
  county?: string;
  city?: string;
  postcode?: string;
  latitude?: number;
  longitude?: number;
}

interface AddressAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onSelect?: (selection: AddressSelection) => void;
  label?: string;
  hint?: string;
  placeholder?: string;
  required?: boolean;
  className?: string;
}

function cleanUsAddress(value: string) {
  return value
    .replace(/,\s*United States of America$/i, "")
    .replace(/,\s*United States$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function suggestionLabel(suggestion: GeoapifySuggestion) {
  if (suggestion.formatted) {
    return cleanUsAddress(suggestion.formatted);
  }

  const primary =
    suggestion.address_line1 ??
    [suggestion.housenumber, suggestion.street].filter(Boolean).join(" ");

  const secondary =
    suggestion.address_line2 ??
    [
      suggestion.city,
      suggestion.county,
      suggestion.state_code ?? suggestion.state,
      suggestion.postcode,
    ]
      .filter(Boolean)
      .join(", ");

  return cleanUsAddress([primary, secondary].filter(Boolean).join(", "));
}

function selectionFromSuggestion(
  suggestion: GeoapifySuggestion,
): AddressSelection {
  return {
    fullAddress: suggestionLabel(suggestion),
    placeId:
      suggestion.place_id ?? `${suggestion.lat ?? ""}-${suggestion.lon ?? ""}`,
    state: suggestion.state_code ?? suggestion.state,
    county: suggestion.county,
    city: suggestion.city,
    postcode: suggestion.postcode,
    latitude: suggestion.lat,
    longitude: suggestion.lon,
  };
}

export function AddressAutocomplete({
  value,
  onChange,
  onSelect,
  label = "Property address",
  hint = "The address of the property that was sold, not your current address.",
  placeholder = "Start typing a street address",
  required = false,
  className,
}: AddressAutocompleteProps) {
  const listboxId = useId();
  const token = process.env.NEXT_PUBLIC_GEOAPIFY_API_KEY;

  const abortControllerRef = useRef<AbortController | null>(null);

  const [suggestions, setSuggestions] = useState<GeoapifySuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [confirmedValue, setConfirmedValue] = useState("");

  /*
   * Whether the current input warrants a lookup.
   *
   * Derived during render rather than reset inside the effect. Clearing state in
   * an effect body causes a cascading render on every keystroke, and briefly
   * renders a stale suggestion list against the new query. Deriving avoids both:
   * when this is false the list below is simply not shown, and no state changes.
   */
  const query = value.trim();

  const searchable = Boolean(
    token && query.length >= 3 && query !== confirmedValue,
  );

  const visibleSuggestions = searchable ? suggestions : [];

  const listOpen = open && searchable && visibleSuggestions.length > 0;

  useEffect(() => {
    if (!searchable || !token) {
      /*
       * Cancel any request already in flight for a previous query. This is an
       * external-system cleanup, not a state write.
       */
      abortControllerRef.current?.abort();
      return;
    }

    const timer = window.setTimeout(async () => {
      abortControllerRef.current?.abort();

      const controller = new AbortController();
      abortControllerRef.current = controller;

      const url = new URL("https://api.geoapify.com/v1/geocode/autocomplete");

      url.searchParams.set("text", query);
      url.searchParams.set("format", "json");
      url.searchParams.set("filter", "countrycode:us");
      url.searchParams.set("lang", "en");
      url.searchParams.set("limit", "6");
      url.searchParams.set("apiKey", token);

      setLoading(true);

      try {
        const response = await fetch(url.toString(), {
          method: "GET",
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`Address lookup failed: ${response.status}`);
        }

        const data = (await response.json()) as GeoapifyResponse;
        const nextSuggestions = data.results ?? [];

        setSuggestions(nextSuggestions);
        setOpen(nextSuggestions.length > 0);
        setActiveIndex(-1);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setSuggestions([]);
        setOpen(false);
        setActiveIndex(-1);
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }, 300);

    return () => {
      window.clearTimeout(timer);
    };
  }, [query, token, searchable]);

  function chooseSuggestion(suggestion: GeoapifySuggestion) {
    const selection = selectionFromSuggestion(suggestion);

    setConfirmedValue(selection.fullAddress);
    setSuggestions([]);
    setOpen(false);
    setActiveIndex(-1);

    onChange(selection.fullAddress);
    onSelect?.(selection);
  }

  function handleInputChange(nextValue: string) {
    setConfirmedValue("");
    onChange(nextValue);

    if (!nextValue.trim()) {
      setSuggestions([]);
      setOpen(false);
      setActiveIndex(-1);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!listOpen || visibleSuggestions.length === 0) {
      if (event.key === "Escape") {
        setOpen(false);
      }

      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();

      setActiveIndex((current) =>
        current >= visibleSuggestions.length - 1 ? 0 : current + 1,
      );

      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();

      setActiveIndex((current) =>
        current <= 0 ? visibleSuggestions.length - 1 : current - 1,
      );

      return;
    }

    if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      chooseSuggestion(visibleSuggestions[activeIndex]);
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      setActiveIndex(-1);
    }
  }

  return (
    <Field
      label={label}
      hint={
        <span>
          {hint}{" "}
          {token && (
            <span className="text-ink-400">
              Start typing to see matching U.S. addresses.
            </span>
          )}
        </span>
      }
      required={required}
      className={className}
    >
      {({ controlId, describedBy }) => (
        <div className="relative">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-3 z-10 flex h-12 items-center text-ink-400"
          >
            <IconSearch size={16} />
          </span>

          <input
            id={controlId}
            value={value}
            onChange={(event) => handleInputChange(event.target.value)}
            onFocus={() => {
              if (visibleSuggestions.length > 0) {
                setOpen(true);
              }
            }}
            onBlur={() => {
              window.setTimeout(() => {
                setOpen(false);
                setActiveIndex(-1);
              }, 120);
            }}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            autoComplete="off"
            spellCheck={false}
            required={required}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={listOpen}
            aria-controls={listOpen ? listboxId : undefined}
            aria-activedescendant={
              listOpen && activeIndex >= 0
                ? `${listboxId}-option-${activeIndex}`
                : undefined
            }
            aria-describedby={describedBy}
            className={cn(
              "h-12 w-full rounded-md border border-line-strong bg-paper pl-9 pr-11 text-md text-ink-900 shadow-xs",
              "placeholder:text-ink-400",
              "transition-[border-color,box-shadow] duration-150",
              "focus:outline-none focus-visible:border-accent-500 focus-visible:ring-3 focus-visible:ring-accent-500/20",
            )}
          />

          {loading && (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 right-3 flex h-12 items-center"
            >
              <span className="size-4 animate-spin rounded-full border-2 border-line-strong border-t-accent-600" />
            </span>
          )}

          {listOpen && (
            <div
              id={listboxId}
              role="listbox"
              aria-label="Address suggestions"
              className={cn(
                "absolute left-0 right-0 top-[calc(100%+0.375rem)] z-50 overflow-hidden",
                "rounded-lg border border-line-strong bg-paper shadow-xl",
              )}
            >
              <div className="max-h-80 overflow-y-auto py-1">
                {visibleSuggestions.map((suggestion, index) => {
                  const selected = index === activeIndex;

                  const primary =
                    suggestion.address_line1 ??
                    [suggestion.housenumber, suggestion.street]
                      .filter(Boolean)
                      .join(" ") ??
                    suggestion.name ??
                    suggestionLabel(suggestion);

                  const secondary =
                    suggestion.address_line2 ??
                    [
                      suggestion.city,
                      suggestion.state_code ?? suggestion.state,
                      suggestion.postcode,
                    ]
                      .filter(Boolean)
                      .join(", ");

                  return (
                    <button
                      key={`${suggestion.place_id ?? suggestionLabel(suggestion)}-${index}`}
                      id={`${listboxId}-option-${index}`}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        chooseSuggestion(suggestion);
                      }}
                      onMouseEnter={() => setActiveIndex(index)}
                      className={cn(
                        "block w-full px-4 py-3 text-left transition-colors",
                        "border-b border-line-subtle last:border-b-0",
                        selected ? "bg-accent-50" : "bg-paper hover:bg-inset",
                      )}
                    >
                      <span className="flex min-w-0 items-start gap-3">
                        <span
                          aria-hidden="true"
                          className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md border border-line-subtle bg-sunken text-accent-700"
                        >
                          <IconSearch size={14} />
                        </span>

                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium leading-snug text-ink-900">
                            {primary}
                          </span>

                          {secondary && (
                            <span className="mt-0.5 block text-xs leading-relaxed text-ink-500">
                              {secondary}
                            </span>
                          )}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="border-t border-line-subtle bg-sunken px-4 py-2 text-right text-2xs text-ink-500">
                Address suggestions by Geoapify
              </div>
            </div>
          )}

          <span className="sr-only" aria-live="polite">
            {loading
              ? "Searching for address suggestions."
              : listOpen
                ? `${visibleSuggestions.length} address suggestions available.`
                : ""}
          </span>
        </div>
      )}
    </Field>
  );
}
