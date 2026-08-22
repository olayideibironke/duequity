import type { Metadata } from "next";
import Link from "next/link";
import { Container, Section, SectionIntro } from "@/components/public/section";
import {
  Callout,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
} from "@/components/ui/surface";
import { Badge } from "@/components/ui/badge";
import { CUSTODIAN_LABEL } from "@/domain/status";
import { IconChevronRight } from "@/components/ui/icon";
import { formatCount } from "@/lib/format";
import { countySlug } from "@/lib/slug";
import {
  resolvePublicCoverage,
  type PublicCoverageState,
} from "@/server/public-jurisdictions";

export const metadata: Metadata = {
  title: "Where we operate",
  description:
    "Duequity operates jurisdiction by jurisdiction. Every county is reviewed and its rules recorded before intake opens. See current coverage and status by state.",
};

export const dynamic = "force-dynamic";

/**
 * COVERAGE INDEX
 *
 * The jurisdiction engine is the foundation of the business, and this page makes
 * that visible rather than claiming blanket national coverage.
 *
 * Every figure comes from persisted jurisdiction rule packages. A jurisdiction is
 * listed as open only when its rule package is approved, its intake gate permits
 * intake, and its payment routing resolves to a launch track Duequity operates.
 *
 * Showing "under review" and "not available" jurisdictions is a deliberate trust
 * decision. A company that lists only its wins is telling you less than one that
 * shows you where it has decided not to operate.
 *
 * When nothing is activated yet, this page says so plainly. That is the correct
 * output, not a failure state.
 */

const COVERAGE_LABEL: Record<PublicCoverageState, string> = {
  open: "Open for claims",
  attorney_required: "Attorney required",
  under_review: "Under review",
  not_available: "Not available",
};

const COVERAGE_TONE: Record<
  PublicCoverageState,
  "positive" | "counsel" | "neutral" | "critical"
> = {
  open: "positive",
  attorney_required: "counsel",
  under_review: "neutral",
  not_available: "critical",
};

export default async function StatesPage() {
  const coverage = await resolvePublicCoverage();

  const recordedCount = coverage.states.reduce(
    (total, state) => total + state.jurisdictions.length,
    0,
  );

  return (
    <>
      <Section tone="ink" size="sm">
        <Container>
          <p className="eyebrow text-accent-300">Coverage</p>
          <h1 className="mt-3 max-w-3xl text-3xl text-white sm:text-4xl">
            Where Duequity operates, and where it does not
          </h1>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-ink-300">
            Surplus rules are set county by county, not nationally. We activate
            a jurisdiction only after its rules have been reviewed against
            official sources and recorded in our compliance system. Everything
            else stays closed.
          </p>
        </Container>
      </Section>

      <Section tone="paper" size="md">
        <Container>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <CoverageStat
              value={formatCount(coverage.totals.open)}
              label="Open for claims"
              hint="Rules reviewed and recorded, intake permitted, payment route established."
              tone="positive"
            />
            <CoverageStat
              value={formatCount(coverage.totals.attorneyRequired)}
              label="Attorney required"
              hint="We coordinate. An independent attorney files and is engaged by you directly."
              tone="counsel"
            />
            <CoverageStat
              value={formatCount(coverage.totals.underReview)}
              label="Under review"
              hint="Intake closed until the review completes."
              tone="neutral"
            />
            <CoverageStat
              value={formatCount(coverage.totals.notAvailable)}
              label="Not available"
              hint="A licensing, regulatory or payment-routing barrier applies."
              tone="critical"
            />
          </div>

          <Callout
            tone="neutral"
            className="mt-8"
            title="Why the list is short"
          >
            <p>
              There are {formatCount(coverage.nation.countyEquivalents)}{" "}
              counties and county equivalents across{" "}
              {formatCount(coverage.nation.statesAndDc)} states and the District
              of Columbia, and the rules differ meaningfully between them. A
              company that claims to operate in all of them on day one is either
              not reading the rules or not following them. We would rather tell
              you no in a jurisdiction we have not cleared than take your case
              and discover the problem later.
            </p>
          </Callout>
        </Container>
      </Section>

      <Section tone="canvas" size="md">
        <Container>
          <SectionIntro
            eyebrow="By state"
            title="Recorded jurisdictions"
            lede="Each entry shows the agency that holds surplus funds and the current intake position."
          />

          {coverage.states.length === 0 ? (
            <div className="mt-10">
              <EmptyState
                title="No jurisdiction is activated yet"
                description="Duequity has not yet completed legal review and payment-routing verification for any jurisdiction, so no county is open for intake. This page will list each jurisdiction as it is activated, alongside the ones we have decided not to operate in."
              />

              <Callout
                tone="neutral"
                className="mt-6"
                title="What this means if you are looking for help today"
              >
                <p>
                  You can still search the public records we have indexed, and
                  you can always claim surplus funds yourself directly from the
                  agency holding them at no cost. We will not sign an agreement
                  with you in a jurisdiction we have not cleared.
                </p>
              </Callout>
            </div>
          ) : (
            <div className="mt-10 space-y-8">
              {coverage.states.map((state) => (
                <Card key={state.state}>
                  <CardHeader
                    title={
                      <Link
                        href={`/states/${state.state.toLowerCase()}`}
                        className="rounded-xs transition-colors hover:text-accent-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500"
                      >
                        {state.stateName}
                      </Link>
                    }
                    description={`${formatCount(state.jurisdictions.length)} recorded ${
                      state.jurisdictions.length === 1
                        ? "jurisdiction"
                        : "jurisdictions"
                    }`}
                    actions={
                      <span className="font-mono text-sm text-ink-400">
                        {state.state}
                      </span>
                    }
                  />
                  <CardBody flush>
                    <ul className="divide-y divide-line-subtle">
                      {state.jurisdictions.map((jurisdiction) => (
                        <li key={jurisdiction.packageId}>
                          <Link
                            href={`/states/${jurisdiction.state.toLowerCase()}/${countySlug(
                              jurisdiction.county,
                            )}`}
                            className="flex items-center gap-4 px-4 py-3.5 transition-colors hover:bg-inset focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-500 sm:px-5"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="text-base font-medium text-ink-900">
                                {jurisdiction.county ?? "Statewide"}
                              </p>
                              <p className="mt-0.5 truncate text-sm text-ink-500">
                                {jurisdiction.agencyName}
                              </p>
                            </div>
                            <div className="hidden shrink-0 sm:block">
                              <Badge tone="neutral">
                                {CUSTODIAN_LABEL[jurisdiction.custodian]}
                              </Badge>
                            </div>
                            <div className="shrink-0">
                              <Badge
                                tone={COVERAGE_TONE[jurisdiction.coverage]}
                                size="md"
                              >
                                {COVERAGE_LABEL[jurisdiction.coverage]}
                              </Badge>
                            </div>
                            <IconChevronRight
                              size={16}
                              className="shrink-0 text-ink-300"
                            />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </CardBody>
                </Card>
              ))}
            </div>
          )}

          <p className="mt-6 text-sm text-ink-500">
            {recordedCount === 0
              ? "No jurisdiction rules have been published yet."
              : `${formatCount(recordedCount)} recorded ${
                  recordedCount === 1 ? "jurisdiction" : "jurisdictions"
                }.`}{" "}
            Geography from {coverage.nation.geographySource}. Every rule shown
            is recorded against the official sources it was taken from and is
            re-reviewed before intake opens.
          </p>
        </Container>
      </Section>
    </>
  );
}

function CoverageStat({
  value,
  label,
  hint,
  tone,
}: {
  value: string;
  label: string;
  hint: string;
  tone: "positive" | "counsel" | "neutral" | "critical";
}) {
  const bar = {
    positive: "bg-accent-500",
    counsel: "bg-counsel-600",
    neutral: "bg-ink-300",
    critical: "bg-critical-600",
  }[tone];

  return (
    <div className="relative overflow-hidden rounded-lg border border-line bg-paper p-4 shadow-xs">
      <span
        aria-hidden="true"
        className={`absolute inset-y-0 left-0 w-0.5 ${bar}`}
      />
      <p className="tnum text-3xl font-semibold text-ink-900">{value}</p>
      <p className="mt-1 text-base font-medium text-ink-800">{label}</p>
      <p className="mt-1 text-sm leading-relaxed text-ink-500">{hint}</p>
    </div>
  );
}
