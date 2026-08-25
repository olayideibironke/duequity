"use client";

import {
  useEffect,
  useState,
} from "react";

import {
  IconClose,
  IconSearch,
} from "@/components/ui/icon";

export const STAFF_MAIL_SEARCH_EVENT =
  "duequity-mail-search";

export const STAFF_MAIL_SEARCH_RESET_EVENT =
  "duequity-mail-search-reset";

export function StaffMailHeaderSearch() {
  const [
    query,
    setQuery,
  ] =
    useState(
      "",
    );

  useEffect(
    () => {
      function handleReset() {
        setQuery(
          "",
        );
      }

      window.addEventListener(
        STAFF_MAIL_SEARCH_RESET_EVENT,
        handleReset,
      );

      return () => {
        window.removeEventListener(
          STAFF_MAIL_SEARCH_RESET_EVENT,
          handleReset,
        );
      };
    },
    [],
  );

  function runSearch(
    value: string,
  ) {
    window.dispatchEvent(
      new CustomEvent(
        STAFF_MAIL_SEARCH_EVENT,
        {
          detail: {
            query:
              value.trim(),
          },
        },
      ),
    );
  }

  return (
    <form
      className="w-full max-w-3xl"
      onSubmit={(
        event,
      ) => {
        event.preventDefault();

        runSearch(
          query,
        );
      }}
    >
      <div className="relative">
        <IconSearch
          size={16}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400"
        />

        <input
          type="search"
          value={
            query
          }
          onChange={(
            event,
          ) => {
            setQuery(
              event.target.value,
            );
          }}
          placeholder="Search mail"
          aria-label="Search all DueQuity Mail"
          className="h-10 w-full rounded-lg border border-line bg-white pl-9 pr-10 text-sm text-ink-900 outline-none transition placeholder:text-ink-400 focus:border-accent-400 focus:ring-2 focus:ring-accent-100"
        />

        {query && (
          <button
            type="button"
            aria-label="Clear mail search"
            onClick={() => {
              setQuery(
                "",
              );

              runSearch(
                "",
              );
            }}
            className="absolute right-2 top-1/2 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-ink-400 transition hover:bg-inset hover:text-ink-800"
          >
            <IconClose
              size={14}
            />
          </button>
        )}
      </div>
    </form>
  );
}