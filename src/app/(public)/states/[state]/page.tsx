import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  Container,
  Section,
  SectionIntro,
} from "@/components/public/section";
import {
  Card,
  CardBody,
  CardHeader,
  Callout,
  DataItem,
  DataList,
  NotRecorded,
} from "@/components/ui/surface";
import { Badge } from "@/components/ui/badge";
import { Breadcrumbs } from "@/components/ui/tabs";
import { ButtonLink } from "@/components/ui/button";
import { IconChevronRight } from "@/components/ui/icon";
import {
  CUSTODIAN_LABEL,
  FEE_MODEL_LABEL,
  SUBMISSION_METHOD_LABEL,
} from "@/domain/status";
import { countySlug } from "@/lib/slug";
import {
  formatCents,
  formatCount,
  formatDate,
} from "@/lib/format";
import {
  publicStateCoverage,
  type PublicCoverageState,
} from "@/server/public-jurisdictions";

export const dynamic = "force-dynamic";

/**
 * STATE COVERAGE DETAIL
 *
 * Lists every recorded jurisdiction in a state with its current public coverage
 * position, taken from the same projection the coverage index uses.
 *
 * The coverage position is derived server side from the persisted rule package:
 * its approval status, its intake gate, and its payment routing. The public page
 * and the internal gate cannot disagree, because they read the same records
 * through the same evaluation.
 *
 * Property checking, surplus discovery and claimant-location research are
 * staff-only capabilities and are not exposed through this public page.
 *
 * There are deliberately no static params. Coverage changes when a rule package
 * is approved, paused or superseded, and a statically generated list of states
 * would keep advertising a jurisdiction after it stopped being available.
 */

const COVERAGE_LABEL: Record<
  PublicCoverageState,
  string
> = {
  open:
    "Open for claims",

  attorney_required:
    "Attorney required",

  under_review:
    "Under review",

  not_available:
    "Not available",
};

const COVERAGE_TONE: Record<
  PublicCoverageState,
  | "positive"
  | "counsel"
  | "neutral"
  | "critical"
> = {
  open:
    "positive",

  attorney_required:
    "counsel",

  under_review:
    "neutral",

  not_available:
    "critical",
};

const COVERAGE_CALLOUT_TONE: Record<
  PublicCoverageState,
  | "positive"
  | "counsel"
  | "neutral"
  | "caution"
> = {
  open:
    "positive",

  attorney_required:
    "counsel",

  under_review:
    "neutral",

  not_available:
    "caution",
};

export async function generateMetadata({
  params,
}: PageProps<"/states/[state]">): Promise<Metadata> {
  const {
    state,
  } =
    await params;

  const record =
    await publicStateCoverage(
      state,
    );

  if (
    !record
  ) {
    return {
      title:
        "Jurisdiction not found",
    };
  }

  return {
    title:
      `${record.stateName} surplus funds`,

    description:
      `Duequity coverage in ${record.stateName}: recorded jurisdictions, the agencies that hold surplus funds, claim deadlines, and current intake position.`,
  };
}

export default async function StatePage({
  params,
}: PageProps<"/states/[state]">) {
  const {
    state,
  } =
    await params;

  const record =
    await publicStateCoverage(
      state,
    );

  if (
    !record
  ) {
    notFound();
  }

  const openCount =
    record.jurisdictions.filter(
      (jurisdiction) =>
        jurisdiction.coverage ===
          "open" ||
        jurisdiction.coverage ===
          "attorney_required",
    ).length;

  return (
    <>
      <Section
        tone="ink"
        size="sm"
      >
        <Container>
          <Breadcrumbs
            className="[&_a]:text-ink-400 [&_a:hover]:text-ink-100 [&_span]:text-ink-300"
            trail={[
              {
                href:
                  "/states",

                label:
                  "Where we operate",
              },
              {
                label:
                  record.stateName,
              },
            ]}
          />

          <p className="eyebrow mt-4 text-accent-300">
            {record.state}
          </p>

          <h1 className="mt-2 text-3xl text-white sm:text-4xl">
            {record.stateName} surplus funds
          </h1>

          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-ink-300">
            {formatCount(
              record.jurisdictions.length,
            )}{" "}
            recorded{" "}
            {record.jurisdictions.length ===
            1
              ? "jurisdiction"
              : "jurisdictions"}{" "}
            in {record.stateName}.{" "}
            {openCount ===
            0
              ? "None currently accepts claims through Duequity."
              : `${formatCount(
                  openCount,
                )} ${
                  openCount ===
                  1
                    ? "accepts"
                    : "accept"
                } claims through Duequity today.`}
          </p>
        </Container>
      </Section>

      <Section
        tone="paper"
        size="md"
      >
        <Container>
          <SectionIntro
            eyebrow="Recorded jurisdictions"
            title={`Agencies holding surplus funds in ${record.stateName}`}
            lede="Each jurisdiction records the agency, the claim method, the statutory deadline and the fee rules that apply. Intake is gated on that record."
          />

          <div className="mt-10 space-y-6">
            {record.jurisdictions.map(
              (
                jurisdiction,
              ) => (
                <Card
                  key={
                    jurisdiction.packageId
                  }
                >
                  <CardHeader
                    eyebrow={
                      CUSTODIAN_LABEL[
                        jurisdiction.custodian
                      ]
                    }
                    title={
                      <Link
                        href={`/states/${jurisdiction.state.toLowerCase()}/${countySlug(
                          jurisdiction.county,
                        )}`}
                        className="rounded-xs transition-colors hover:text-accent-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500"
                      >
                        {jurisdiction.county ??
                          "Statewide"}
                      </Link>
                    }
                    description={
                      jurisdiction.agencyName
                    }
                    actions={
                      <Badge
                        tone={
                          COVERAGE_TONE[
                            jurisdiction.coverage
                          ]
                        }
                        size="md"
                      >
                        {
                          COVERAGE_LABEL[
                            jurisdiction.coverage
                          ]
                        }
                      </Badge>
                    }
                  />

                  <CardBody>
                    <DataList columns={3}>
                      <DataItem label="Claim method">
                        {
                          SUBMISSION_METHOD_LABEL[
                            jurisdiction.claimMethod
                          ]
                        }
                      </DataItem>

                      <DataItem label="Claim window">
                        {jurisdiction.claimDeadlineDays !==
                        undefined ? (
                          `${
                            Math.round(
                              (
                                jurisdiction.claimDeadlineDays /
                                365
                              ) *
                                10,
                            ) /
                            10
                          } years from sale`
                        ) : (
                          <NotRecorded />
                        )}
                      </DataItem>

                      <DataItem label="Attorney required">
                        {jurisdiction.attorneyRequired ? (
                          <Badge tone="counsel">
                            Yes
                          </Badge>
                        ) : (
                          <span className="text-ink-600">
                            No
                          </span>
                        )}
                      </DataItem>

                      <DataItem label="Permitted fees">
                        {jurisdiction.permittedFeeModels.length >
                        0 ? (
                          jurisdiction.permittedFeeModels
                            .map(
                              (
                                model,
                              ) =>
                                FEE_MODEL_LABEL[
                                  model
                                ],
                            )
                            .join(
                              ", ",
                            )
                        ) : (
                          <NotRecorded label="None recorded" />
                        )}
                      </DataItem>

                      <DataItem label="Fee ceiling">
                        {jurisdiction.feeCapPercent !==
                        undefined ? (
                          `${(
                            jurisdiction.feeCapPercent *
                            100
                          ).toFixed(
                            1,
                          )}%`
                        ) : jurisdiction.feeCapAmount !==
                          undefined ? (
                          formatCents(
                            jurisdiction.feeCapAmount,
                          )
                        ) : (
                          <NotRecorded label="Not recorded" />
                        )}
                      </DataItem>

                      <DataItem label="Last legal review">
                        {jurisdiction.lastLegalReview ? (
                          formatDate(
                            jurisdiction.lastLegalReview,
                          )
                        ) : (
                          <NotRecorded label="Not yet reviewed" />
                        )}
                      </DataItem>
                    </DataList>

                    <Callout
                      tone={
                        COVERAGE_CALLOUT_TONE[
                          jurisdiction.coverage
                        ]
                      }
                      title={
                        COVERAGE_LABEL[
                          jurisdiction.coverage
                        ]
                      }
                      className="mt-4"
                    >
                      <p>
                        {jurisdiction.coverageReason ??
                          "This jurisdiction is cleared for administrative claims under its recorded rules."}
                      </p>
                    </Callout>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <ButtonLink
                        href={`/states/${jurisdiction.state.toLowerCase()}/${countySlug(
                          jurisdiction.county,
                        )}`}
                        size="sm"
                        trailing={
                          <IconChevronRight
                            size={14}
                          />
                        }
                      >
                        Jurisdiction detail
                      </ButtonLink>
                    </div>
                  </CardBody>
                </Card>
              ),
            )}
          </div>

          <p className="mt-6 text-sm text-ink-500">
            Every rule shown is recorded against the official sources it was
            taken from, carries a legal-rule version, and is re-reviewed before
            intake opens. Where a value is not recorded, this page says so
            rather than filling the gap.
          </p>
        </Container>
      </Section>
    </>
  );
}