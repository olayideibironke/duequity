"use client";

import {
  FormEvent,
  useEffect,
  useState,
} from "react";

import {
  IconClose,
  IconSearch,
} from "@/components/ui/icon";

export const CLAIMANT_MESSAGE_SEARCH_EVENT =
  "duequity-claimant-message-search";

export const CLAIMANT_MESSAGE_SEARCH_RESET_EVENT =
  "duequity-claimant-message-search-reset";

export function ClaimantMessageHeaderSearch() {
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
        CLAIMANT_MESSAGE_SEARCH_RESET_EVENT,
        handleReset,
      );

      return () => {
        window.removeEventListener(
          CLAIMANT_MESSAGE_SEARCH_RESET_EVENT,
          handleReset,
        );
      };
    },
    [],
  );

  function submit(
    event:
      FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    window.dispatchEvent(
      new CustomEvent(
        CLAIMANT_MESSAGE_SEARCH_EVENT,
        {
          detail: {
            query:
              query.trim(),
          },
        },
      ),
    );
  }

  function clear() {
    setQuery(
      "",
    );

    window.dispatchEvent(
      new CustomEvent(
        CLAIMANT_MESSAGE_SEARCH_EVENT,
        {
          detail: {
            query:
              "",
          },
        },
      ),
    );
  }

  return (
    <form
      onSubmit={
        submit
      }
      className="relative min-w-0 flex-1"
      role="search"
    >
      <IconSearch
        size={15}
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
        placeholder="Search claimant messages"
        aria-label="Search claimant messages"
        className="h-9 w-full rounded-md border border-line bg-white pl-9 pr-10 text-sm text-ink-900 outline-none transition placeholder:text-ink-400 focus:border-accent-400 focus:ring-2 focus:ring-accent-100"
      />

      {query && (
        <button
          type="button"
          onClick={
            clear
          }
          aria-label="Clear claimant message search"
          className="absolute right-2 top-1/2 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-ink-400 hover:bg-inset hover:text-ink-900"
        >
          <IconClose
            size={14}
          />
        </button>
      )}
    </form>
  );
}