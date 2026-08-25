"use client";

import {
  useMemo,
  useState,
} from "react";

import {
  useRouter,
} from "next/navigation";

/* ========================================================================== */
/* Types                                                                       */
/* ========================================================================== */

export interface CountyHarvestOption {
  geoid: string;

  name: string;
}

export interface StateHarvestOption {
  postalCode: string;

  name: string;

  counties:
    CountyHarvestOption[];
}

interface CountyHarvestResponse {
  ok: boolean;

  message?: string;

  harvest?: {
    state: string;

    stateName: string;

    county: string;

    countyGeoid: string;

    sourceName: string;

    harvestedAt: string;

    sourceRecordCount: number;

    stagedRecordCount: number;

    createdCount: number;

    refreshedCount: number;
  };
}

/* ========================================================================== */
/* Component                                                                   */
/* ========================================================================== */

export function CountySurplusHarvestControls({
  states,
}: {
  states:
    StateHarvestOption[];
}) {
  const router =
    useRouter();

  const [
    stateCode,
    setStateCode,
  ] =
    useState(
      "",
    );

  const [
    countyGeoid,
    setCountyGeoid,
  ] =
    useState(
      "",
    );

  const [
    submitting,
    setSubmitting,
  ] =
    useState(
      false,
    );

  const [
    exportReady,
    setExportReady,
  ] =
    useState(
      false,
    );

  const [
    error,
    setError,
  ] =
    useState<
      string | null
    >(
      null,
    );

  const [
    success,
    setSuccess,
  ] =
    useState<
      string | null
    >(
      null,
    );

  const selectedState =
    useMemo(
      () =>
        states.find(
          (state) =>
            state.postalCode ===
            stateCode,
        ),
      [
        stateCode,
        states,
      ],
    );

  const counties =
    selectedState
      ?.counties ??
    [];

  const selectedCounty =
    useMemo(
      () =>
        counties.find(
          (county) =>
            county.geoid ===
            countyGeoid,
        ),
      [
        counties,
        countyGeoid,
      ],
    );

  const exportHref =
    selectedState &&
    selectedCounty
      ? `/api/pro/discovered-records/export?state=${encodeURIComponent(
          selectedState.postalCode,
        )}&countyGeoid=${encodeURIComponent(
          selectedCounty.geoid,
        )}`
      : undefined;

  function handleStateChange(
    value:
      string,
  ) {
    setStateCode(
      value,
    );

    setCountyGeoid(
      "",
    );

    setExportReady(
      false,
    );

    setError(
      null,
    );

    setSuccess(
      null,
    );
  }

  function handleCountyChange(
    value:
      string,
  ) {
    setCountyGeoid(
      value,
    );

    setExportReady(
      false,
    );

    setError(
      null,
    );

    setSuccess(
      null,
    );
  }

  async function pullRecords() {
    if (
      submitting
    ) {
      return;
    }

    if (
      !selectedState
    ) {
      setError(
        "Select a state before pulling surplus records.",
      );

      return;
    }

    if (
      !selectedCounty
    ) {
      setError(
        "Select a county before pulling surplus records.",
      );

      return;
    }

    setSubmitting(
      true,
    );

    setExportReady(
      false,
    );

    setError(
      null,
    );

    setSuccess(
      null,
    );

    try {
      const response =
        await fetch(
          "/api/pro/discovered-records/county-harvest",
          {
            method:
              "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                state:
                  selectedState.postalCode,

                countyGeoid:
                  selectedCounty.geoid,
              }),
          },
        );

      const payload =
        await response.json() as
          CountyHarvestResponse;

      if (
        !response.ok ||
        !payload.ok ||
        !payload.harvest
      ) {
        throw new Error(
          payload.message ??
            "Duequity could not pull official surplus records for this county.",
        );
      }

      const harvest =
        payload.harvest;

      setSuccess(
        `${harvest.county}, ${harvest.state}: ${harvest.stagedRecordCount} record${
          harvest.stagedRecordCount ===
          1
            ? ""
            : "s"
        } staged from ${harvest.sourceName}. ${harvest.createdCount} new, ${harvest.refreshedCount} refreshed. Excel export is ready.`,
      );

      setExportReady(
        true,
      );

      router.refresh();
    } catch (
      caught
    ) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Duequity could not pull official surplus records for this county.",
      );
    } finally {
      setSubmitting(
        false,
      );
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label
            htmlFor="county-harvest-state"
            className="block text-xs font-semibold text-ink-700"
          >
            State
          </label>

          <select
            id="county-harvest-state"
            value={
              stateCode
            }
            onChange={(
              event,
            ) =>
              handleStateChange(
                event.target.value,
              )
            }
            className="mt-1.5 min-h-10 w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink-900 outline-none transition focus:border-accent-500 focus:ring-2 focus:ring-accent-200"
          >
            <option value="">
              Select state
            </option>

            {states.map(
              (
                state,
              ) => (
                <option
                  key={
                    state.postalCode
                  }
                  value={
                    state.postalCode
                  }
                >
                  {
                    state.name
                  }{" "}
                  (
                  {
                    state.postalCode
                  }
                  )
                </option>
              ),
            )}
          </select>
        </div>

        <div>
          <label
            htmlFor="county-harvest-county"
            className="block text-xs font-semibold text-ink-700"
          >
            County
          </label>

          <select
            id="county-harvest-county"
            value={
              countyGeoid
            }
            disabled={
              !selectedState
            }
            onChange={(
              event,
            ) =>
              handleCountyChange(
                event.target.value,
              )
            }
            className="mt-1.5 min-h-10 w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink-900 outline-none transition focus:border-accent-500 focus:ring-2 focus:ring-accent-200 disabled:cursor-not-allowed disabled:bg-inset disabled:text-ink-400"
          >
            <option value="">
              {selectedState
                ? "Select county"
                : "Select a state first"}
            </option>

            {counties.map(
              (
                county,
              ) => (
                <option
                  key={
                    county.geoid
                  }
                  value={
                    county.geoid
                  }
                >
                  {
                    county.name
                  }
                </option>
              ),
            )}
          </select>

          <p className="mt-1 text-2xs text-ink-400">
            Counties come from Duequity&apos;s validated national geography
            registry.
          </p>
        </div>
      </div>

      <div className="rounded-md border border-line bg-inset px-4 py-3.5">
        <p className="text-sm font-semibold text-ink-900">
          Official county surplus records
        </p>

        <p className="mt-1 text-xs leading-relaxed text-ink-600">
          Duequity pulls available surplus records from the official government
          source and stages them for administrator review and Excel export.
        </p>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={
              submitting ||
              !selectedState ||
              !selectedCounty
            }
            onClick={() =>
              void pullRecords()
            }
            className="inline-flex min-h-9 items-center justify-center rounded-md bg-accent-700 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-accent-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting
              ? "Pulling records..."
              : "Pull Available Surplus Records"}
          </button>

          {exportReady &&
            exportHref && (
              <a
                href={
                  exportHref
                }
                className="inline-flex min-h-9 items-center justify-center rounded-md border border-accent-300 bg-paper px-3.5 py-2 text-sm font-semibold text-accent-800 transition hover:bg-accent-50"
              >
                Export Excel
              </a>
            )}
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-md border border-critical-200 bg-critical-50 px-3.5 py-3 text-sm text-critical-800"
        >
          {
            error
          }
        </div>
      )}

      {success && (
        <div
          role="status"
          className="rounded-md border border-positive-200 bg-positive-50 px-3.5 py-3 text-sm text-positive-800"
        >
          {
            success
          }
        </div>
      )}

      {exportReady &&
        selectedCounty && (
          <div className="rounded-md border border-line bg-paper px-3.5 py-3">
            <p className="text-xs font-semibold text-ink-700">
              Excel report ready
            </p>

            <p className="mt-1 text-xs leading-relaxed text-ink-500">
              Download the official discovery report for{" "}
              {
                selectedCounty.name
              }.
              Missing claimant contact fields remain blank until external
              research establishes them.
            </p>
          </div>
        )}

      <p className="text-xs leading-relaxed text-ink-500">
        Pulling public records stages discovery leads only. It does not create
        a claimant, Opportunity, Claim, claimant login, outreach authorization,
        or onboarding record.
      </p>
    </div>
  );
}