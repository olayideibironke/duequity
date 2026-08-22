"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import { IconSearch } from "@/components/ui/icon";

/**
 * GLOBAL OPERATIONS SEARCH
 *
 * Search quality is operationally important, because a specialist on a phone call
 * has one identifier in front of them and needs the record now.
 *
 * Behaviour:
 *   - slash or command K focuses it from anywhere
 *   - results are fetched from the server as you type, debounced
 *   - arrow keys and Enter navigate, Escape dismisses
 *
 * SERVER AUTHORITY
 *
 * This component holds no operational data. Every query is resolved by
 * `/api/pro/search`, which applies the authenticated operator's permissions and
 * state clearance before returning anything. Nothing about the record corpus is
 * shipped to the browser, and the browser cannot widen its own visibility.
 *
 * In-flight requests are aborted when the query changes, so a slow earlier
 * response can never overwrite a newer result set.
 */

type OperationsSearchResultKind =
  | "opportunity"
  | "claim"
  | "claimant"
  | "property"
  | "jurisdiction"
  | "discovered_record";

interface OperationsSearchResult {
  kind: OperationsSearchResultKind;
  id: string;
  href: string;
  title: string;
  subtitle: string;
  matchedOn: string;
}

interface SearchApiPayload {
  ok?: boolean;
  query?: string;
  results?: OperationsSearchResult[];
  error?: string;
}

const KIND_LABEL: Record<OperationsSearchResultKind, string> = {
  claim: "Claim",
  opportunity: "Opportunity",
  claimant: "Claimant",
  property: "Property",
  jurisdiction: "Jurisdiction",
  discovered_record: "Discovered",
};

const KIND_TONE: Record<OperationsSearchResultKind, string> = {
  claim: "bg-accent-100 text-accent-800",
  opportunity: "bg-info-100 text-info-700",
  claimant: "bg-ink-100 text-ink-700",
  property: "bg-bronze-100 text-bronze-700",
  jurisdiction: "bg-counsel-100 text-counsel-700",
  discovered_record: "bg-sunken text-ink-600",
};

const MINIMUM_QUERY_LENGTH = 2;

const DEBOUNCE_MS = 200;

export function ProSearch() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [results, setResults] = useState<OperationsSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const trimmed = query.trim();

  /* ---------------------------------------------------------------- fetch */

  const runSearch = useCallback(async (value: string) => {
    abortRef.current?.abort();

    if (value.length < MINIMUM_QUERY_LENGTH) {
      setResults([]);
      setError("");
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError("");

    try {
      const response = await fetch(
        `/api/pro/search?q=${encodeURIComponent(value)}`,
        {
          method: "GET",
          cache: "no-store",
          signal: controller.signal,
          headers: { Accept: "application/json" },
        },
      );

      const payload = (await response.json()) as SearchApiPayload;

      if (!response.ok || payload.ok !== true) {
        throw new Error(payload.error ?? "Search could not be completed.");
      }

      setResults(payload.results ?? []);
      setHighlight(0);
    } catch (searchError) {
      if (
        searchError instanceof DOMException &&
        searchError.name === "AbortError"
      ) {
        return;
      }

      setResults([]);

      setError(
        searchError instanceof Error
          ? searchError.message
          : "Search could not be completed.",
      );
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      void runSearch(trimmed);
    }, DEBOUNCE_MS);

    return () => {
      window.clearTimeout(handle);
    };
  }, [trimmed, runSearch]);

  useEffect(
    () => () => {
      abortRef.current?.abort();
    },
    [],
  );

  /* ------------------------------------------------------------- shortcuts */

  // Slash and command K focus the field from anywhere, as long as the operator is not
  // already typing into another control.
  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT" ||
        target?.isContentEditable;

      if (
        (event.key === "k" && (event.metaKey || event.ctrlKey)) ||
        (event.key === "/" && !typing)
      ) {
        event.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
      if (event.key === "Escape") {
        setOpen(false);
        inputRef.current?.blur();
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  // Guard against a stale index if the result set shrank.
  const activeIndex = highlight < results.length ? highlight : 0;

  function go(result: OperationsSearchResult) {
    setOpen(false);
    setQuery("");
    setResults([]);
    router.push(result.href);
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if (results.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlight((activeIndex + 1) % results.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight((activeIndex - 1 + results.length) % results.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const chosen = results[activeIndex];
      if (chosen) go(chosen);
    }
  }

  const showPanel = open && trimmed.length >= MINIMUM_QUERY_LENGTH;

  return (
    <div className="relative min-w-0 max-w-2xl flex-1">
      <label htmlFor="pro-search" className="sr-only">
        Search claims, opportunities, claimants, properties and jurisdictions
      </label>
      <div className="relative">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-ink-400"
        >
          <IconSearch size={16} />
        </span>
        <input
          ref={inputRef}
          id="pro-search"
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            // Delay so a click on a result registers before the panel unmounts.
            window.setTimeout(() => setOpen(false), 150);
          }}
          onKeyDown={handleKeyDown}
          placeholder="Search claims, cases, parcels, names"
          autoComplete="off"
          spellCheck={false}
          role="combobox"
          aria-expanded={showPanel}
          aria-controls="pro-search-results"
          aria-autocomplete="list"
          className="h-9 w-full rounded-md border border-line-strong bg-inset pr-14 pl-9 text-sm text-ink-900 placeholder:text-ink-400 focus:border-accent-500 focus:bg-paper focus:outline-none focus-visible:ring-3 focus-visible:ring-accent-500/20"
        />
        <kbd
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-2.5 my-auto flex h-5 items-center rounded-xs border border-line-strong bg-paper px-1.5 font-mono text-2xs text-ink-400"
        >
          /
        </kbd>
      </div>

      {showPanel && (
        <div
          id="pro-search-results"
          role="listbox"
          className="absolute inset-x-0 top-full z-50 mt-1.5 max-h-[70vh] overflow-y-auto rounded-lg border border-line bg-paper py-1 shadow-overlay"
        >
          {error ? (
            <p className="px-3.5 py-4 text-sm text-critical-700">{error}</p>
          ) : loading && results.length === 0 ? (
            <p className="px-3.5 py-4 text-sm text-ink-500">
              Searching persisted records…
            </p>
          ) : results.length === 0 ? (
            <p className="px-3.5 py-4 text-sm text-ink-500">
              No persisted records match{" "}
              <span className="font-medium text-ink-700">{trimmed}</span>. Try a
              claim reference, case number, parcel number, address or name.
            </p>
          ) : (
            <ul>
              {results.map((result, index) => (
                <li key={`${result.kind}-${result.id}`}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={index === activeIndex}
                    onMouseEnter={() => setHighlight(index)}
                    onClick={() => go(result)}
                    className={cn(
                      "flex w-full items-center gap-3 px-3 py-2 text-left transition-colors",
                      index === activeIndex ? "bg-inset" : "bg-transparent",
                    )}
                  >
                    <span
                      className={cn(
                        "shrink-0 rounded-xs px-1.5 py-0.5 text-2xs font-semibold",
                        KIND_TONE[result.kind],
                      )}
                    >
                      {KIND_LABEL[result.kind]}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink-900">
                        {result.title}
                      </span>
                      <span className="block truncate text-xs text-ink-500">
                        {result.subtitle}
                      </span>
                    </span>
                    <span className="hidden shrink-0 text-2xs text-ink-400 sm:block">
                      {result.matchedOn}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
