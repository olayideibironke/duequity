import type { Metadata } from "next";

import Link from "next/link";

import {
  Container,
  Section,
  SectionIntro,
} from "@/components/public/section";

import {
  Callout,
} from "@/components/ui/surface";

import {
  formatCount,
} from "@/lib/format";

import {
  loadNationalGeography,
} from "@/server/geography-resolver";

export const metadata: Metadata = {
  title: "Where We Operate | Nationwide",
  description:
    "Explore Duequity's nationwide coverage directory across all 50 states, the District of Columbia, and U.S. counties and county equivalents.",
};

export const dynamic = "force-dynamic";

/**
 * NATIONWIDE COVERAGE DIRECTORY
 *
 * This public page is geographic, not an internal compliance dashboard.
 *
 * Duequity maintains a national geography registry covering the 50 states,
 * District of Columbia, and U.S. counties and county equivalents.
 *
 * Listing a jurisdiction here means Duequity recognizes and supports the
 * jurisdiction in its national coverage and research system. It does not mean
 * every surplus claim is currently eligible for intake or that every county
 * source has already been activated.
 *
 * Operational eligibility remains controlled by Duequity's private
 * jurisdiction, source, payment-routing and compliance systems.
 */

/* ========================================================================== */
/* Page                                                                        */
/* ========================================================================== */

export default async function StatesPage() {
  const geography =
    await loadNationalGeography();

  const states =
    geography.states;

  const stateCount =
    states.filter(
      (state) =>
        state.postalCode !==
        "DC",
    ).length;

  const hasDistrictOfColumbia =
    states.some(
      (state) =>
        state.postalCode ===
        "DC",
    );

  const countyEquivalentCount =
    states.reduce(
      (
        total,
        state,
      ) =>
        total +
        state.counties.length,
      0,
    );

  return (
    <>
      {/* ================================================================ hero */}
      <Section
        tone="ink"
        size="sm"
      >
        <Container>
          <p className="eyebrow text-accent-300">
            Nationwide
          </p>

          <h1 className="mt-3 max-w-3xl text-3xl text-white sm:text-4xl">
            Where We Operate
          </h1>

          <p className="mt-4 max-w-3xl text-lg leading-relaxed text-ink-300">
            Duequity maintains nationwide coverage across all 50 states and the
            District of Columbia. Search our directory below to find your state
            and county or county equivalent.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/check"
              className="inline-flex min-h-11 items-center justify-center rounded-md bg-accent-700 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-400"
            >
              Check a property
            </Link>

            <a
              href="tel:+18886692551"
              className="inline-flex min-h-11 items-center justify-center rounded-md border border-ink-700 bg-ink-900 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:border-ink-500 hover:bg-ink-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-400"
            >
              Call 1-888-669-2551
            </a>
          </div>
        </Container>
      </Section>

      {/* =========================================================== national stats */}
      <Section
        tone="paper"
        size="sm"
      >
        <Container>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <CoverageStat
              value={formatCount(stateCount)}
              label="States"
              hint="All U.S. states are represented in Duequity's national geography system."
            />

            <CoverageStat
              value={
                hasDistrictOfColumbia
                  ? "1"
                  : "0"
              }
              label="District of Columbia"
              hint="Washington, D.C. is included as a county-equivalent jurisdiction."
            />

            <CoverageStat
              value={formatCount(
                countyEquivalentCount,
              )}
              label="Counties and equivalents"
              hint="County, parish, borough, independent-city and equivalent jurisdictions."
            />

            <CoverageStat
              value="Nationwide"
              label="Coverage directory"
              hint="Property and claimant research can be organized nationally by jurisdiction."
            />
          </div>

          <Callout
            tone="neutral"
            className="mt-6"
            title="What nationwide coverage means"
          >
            <p>
              Every state and county shown below is part of Duequity&apos;s
              nationwide jurisdiction directory. A listing does not guarantee
              that a particular surplus claim is currently eligible for
              Duequity services. Claim requirements, available records, payment
              routes, deadlines, and operating rules vary by jurisdiction and
              are evaluated before a claim moves forward.
            </p>
          </Callout>
        </Container>
      </Section>

      {/* ======================================================== state directory */}
      <Section
        tone="canvas"
        size="md"
      >
        <Container>
          <SectionIntro
            eyebrow="Nationwide directory"
            title="Find your state and county"
            lede="Select a state below to view every county or county-equivalent jurisdiction in Duequity's national geography registry."
          />

          <div className="mt-8 space-y-3">
            {states.map(
              (state) => (
                <details
                  key={state.postalCode}
                  className="group overflow-hidden rounded-lg border border-line bg-paper shadow-xs"
                >
                  <summary className="flex cursor-pointer list-none items-center gap-4 px-4 py-4 transition-colors hover:bg-inset focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-500 sm:px-5">
                    <div className="min-w-0 flex-1">
                      <p className="text-base font-semibold text-ink-900">
                        {state.name}
                      </p>

                      <p className="mt-0.5 text-sm text-ink-500">
                        {formatCount(
                          state.counties.length,
                        )}{" "}
                        {state.counties.length ===
                        1
                          ? "county or equivalent"
                          : "counties or equivalents"}
                      </p>
                    </div>

                    <span className="shrink-0 rounded-md border border-line bg-inset px-2.5 py-1 font-mono text-xs font-semibold text-ink-600">
                      {state.postalCode}
                    </span>

                    <span
                      aria-hidden="true"
                      className="shrink-0 text-lg text-ink-400 transition-transform group-open:rotate-45"
                    >
                      +
                    </span>
                  </summary>

                  <div className="border-t border-line bg-canvas px-4 py-4 sm:px-5">
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                      {state.counties.map(
                        (county) => (
                          <div
                            key={county.geoid}
                            className="rounded-md border border-line bg-paper px-3.5 py-3"
                          >
                            <p className="text-sm font-medium text-ink-800">
                              {county.name}
                            </p>

                            <p className="mt-1 font-mono text-2xs text-ink-400">
                              GEOID {county.geoid}
                            </p>
                          </div>
                        ),
                      )}
                    </div>
                  </div>
                </details>
              ),
            )}
          </div>

          <div className="mt-8 rounded-lg border border-line bg-paper p-5">
            <p className="text-sm font-semibold text-ink-900">
              Don&apos;t see the answer you need?
            </p>

            <p className="mt-1 max-w-3xl text-sm leading-relaxed text-ink-600">
              Finding your state and county confirms that the jurisdiction is
              represented in Duequity&apos;s nationwide directory. To check
              whether we have a matching surplus record for a specific
              property, start with the property search.
            </p>

            <div className="mt-4 flex flex-wrap gap-3">
              <Link
                href="/check"
                className="inline-flex min-h-10 items-center justify-center rounded-md bg-accent-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500"
              >
                Check a property
              </Link>

              <a
                href="tel:+18886692551"
                className="inline-flex min-h-10 items-center justify-center rounded-md border border-line bg-paper px-4 py-2 text-sm font-semibold text-ink-800 transition-colors hover:bg-inset focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500"
              >
                Call 1-888-669-2551
              </a>
            </div>
          </div>
        </Container>
      </Section>
    </>
  );
}

/* ========================================================================== */
/* Coverage stat                                                               */
/* ========================================================================== */

function CoverageStat({
  value,
  label,
  hint,
}: {
  value: string;

  label: string;

  hint: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-lg border border-line bg-paper p-4 shadow-xs">
      <span
        aria-hidden="true"
        className="absolute inset-y-0 left-0 w-0.5 bg-accent-500"
      />

      <p className="tnum text-3xl font-semibold text-ink-900">
        {value}
      </p>

      <p className="mt-1 text-base font-medium text-ink-800">
        {label}
      </p>

      <p className="mt-1 text-sm leading-relaxed text-ink-500">
        {hint}
      </p>
    </div>
  );
}