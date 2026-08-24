import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  Container,
  Prose,
  Section,
  SectionIntro,
} from "@/components/public/section";
import {
  Callout,
  Card,
  CardBody,
  CardHeader,
  DataItem,
  DataList,
  GovernmentDisclosure,
  NotRecorded,
} from "@/components/ui/surface";
import { Badge } from "@/components/ui/badge";
import { Breadcrumbs } from "@/components/ui/tabs";
import { TextLink } from "@/components/ui/button";
import { Checklist } from "@/components/ui/timeline";
import {
  CUSTODIAN_LABEL,
  DOCUMENT_KIND_LABEL,
  FEE_MODEL_LABEL,
  SUBMISSION_METHOD_LABEL,
} from "@/domain/status";
import {
  formatCents,
  formatDate,
  formatPhone,
} from "@/lib/format";
import {
  findPublicJurisdiction,
  type PublicCoverageState,
  type PublicJurisdiction,
} from "@/server/public-jurisdictions";

export const dynamic = "force-dynamic";

/**
 * JURISDICTION DETAIL
 *
 * The public expression of a persisted jurisdiction rule package.
 *
 * This page exists for a specific trust reason: it hands a visitor the public
 * jurisdiction information needed to understand how a direct claim may work,
 * including the agency's own published contact information and claim form where
 * available. The free option is never hidden.
 *
 * Property discovery, surplus searches, claimant-location research and related
 * operational tools are staff-only capabilities and are not exposed here.
 *
 * WHAT IS NOT PUBLISHED
 *
 * Internal review commentary and the identity of the reviewing officer are not
 * projected onto the public shape. Everything on this page is either a recorded
 * rule, an official agency detail, or a derived disclosure.
 *
 * Routes are resolved per request rather than statically generated, because a
 * jurisdiction's availability changes when its rule package is approved, paused
 * or superseded.
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

function jurisdictionTitle(
  jurisdiction: PublicJurisdiction,
): string {
  return jurisdiction.county
    ? `${jurisdiction.county}, ${jurisdiction.stateName}`
    : `${jurisdiction.stateName} (statewide)`;
}

function disclosureSourceLabel(
  source: string,
): string {
  switch (
    source
  ) {
    case "jurisdiction_rule":
      return "Required by this jurisdiction";

    case "federal":
      return "Required by federal rule";

    default:
      return "Duequity policy in every jurisdiction";
  }
}

export async function generateMetadata({
  params,
}: PageProps<"/states/[state]/[county]">): Promise<Metadata> {
  const {
    state,
    county,
  } =
    await params;

  const jurisdiction =
    await findPublicJurisdiction(
      state,
      county,
    );

  if (
    !jurisdiction
  ) {
    return {
      title:
        "Jurisdiction not found",
    };
  }

  return {
    title:
      `${jurisdictionTitle(jurisdiction)} surplus funds`,

    description:
      `How surplus funds are claimed in ${jurisdictionTitle(jurisdiction)}: the agency that holds them, required documents, the claim deadline, and how to file directly at no cost.`,
  };
}

export default async function CountyPage({
  params,
}: PageProps<"/states/[state]/[county]">) {
  const {
    state,
    county,
  } =
    await params;

  const jurisdiction =
    await findPublicJurisdiction(
      state,
      county,
    );

  if (
    !jurisdiction
  ) {
    notFound();
  }

  const title =
    jurisdictionTitle(
      jurisdiction,
    );

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
                href:
                  `/states/${jurisdiction.state.toLowerCase()}`,

                label:
                  jurisdiction.stateName,
              },
              {
                label:
                  jurisdiction.county ??
                  "Statewide",
              },
            ]}
          />

          <p className="eyebrow mt-4 text-accent-300">
            {
              CUSTODIAN_LABEL[
                jurisdiction.custodian
              ]
            }
          </p>

          <h1 className="mt-2 text-3xl text-white sm:text-4xl">
            {title}
          </h1>

          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-ink-300">
            {jurisdiction.agencyName}
          </p>

          <div className="mt-5">
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
          </div>
        </Container>
      </Section>

      <Section
        tone="paper"
        size="md"
      >
        <Container>
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-14">
            <div className="min-w-0">
              {/* Coverage position, derived from the persisted rule package. */}
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
              >
                <p>
                  {jurisdiction.coverageReason ??
                    "This jurisdiction is cleared for administrative claims under its recorded rules."}
                </p>

                <p className="mt-2 text-sm">
                  You may always claim surplus funds yourself, directly from the
                  agency below, at no cost. That is true in every jurisdiction
                  and regardless of what this page says about Duequity.
                </p>
              </Callout>

              {/* ------------------------------------------- claim procedure */}
              <div className="mt-10">
                <SectionIntro
                  eyebrow="Claim procedure"
                  title="How a claim is made here"
                />

                <Card className="mt-5">
                  <CardBody>
                    <DataList columns={2}>
                      <DataItem label="Submission method">
                        {
                          SUBMISSION_METHOD_LABEL[
                            jurisdiction.claimMethod
                          ]
                        }
                      </DataItem>

                      <DataItem label="Funds held by">
                        {
                          CUSTODIAN_LABEL[
                            jurisdiction.custodian
                          ]
                        }
                      </DataItem>

                      <DataItem label="Claim window">
                        {jurisdiction.claimDeadlineDays !==
                        undefined ? (
                          <>
                            {
                              jurisdiction.claimDeadlineDays
                            }{" "}
                            days from the sale date

                            <span className="ml-1.5 text-sm text-ink-500">
                              {" "}
                              (about{" "}
                              {Math.round(
                                (
                                  jurisdiction.claimDeadlineDays /
                                  365
                                ) *
                                  10,
                              ) /
                                10}{" "}
                              years)
                            </span>
                          </>
                        ) : (
                          <NotRecorded label="Not recorded, research required" />
                        )}
                      </DataItem>

                      <DataItem label="Controlling authority">
                        {jurisdiction.statuteReference ??
                          <NotRecorded />}
                      </DataItem>

                      <DataItem label="Power of attorney accepted">
                        {jurisdiction.powerOfAttorneyAccepted
                          ? "Yes"
                          : "No"}
                      </DataItem>

                      <DataItem label="Claim assignment permitted">
                        {jurisdiction.assignmentPermitted ? (
                          <span>
                            Yes.{" "}
                            <span className="text-ink-500">
                              Duequity does not purchase, acquire or take
                              assignment of claims in any jurisdiction.
                            </span>
                          </span>
                        ) : (
                          <span>
                            No.{" "}
                            <span className="text-ink-500">
                              Duequity does not purchase claims in any
                              jurisdiction.
                            </span>
                          </span>
                        )}
                      </DataItem>

                      <DataItem
                        label="Estate required if owner deceased"
                        span
                      >
                        {jurisdiction.probateRequiredWhenDeceased ? (
                          <>
                            Yes. An estate generally must be opened before the
                            agency will disburse to heirs.
                          </>
                        ) : (
                          "Not generally required."
                        )}
                      </DataItem>

                      {jurisdiction.paymentRoutingNote && (
                        <DataItem
                          label="How payment is issued"
                          span
                        >
                          {
                            jurisdiction.paymentRoutingNote
                          }
                        </DataItem>
                      )}
                    </DataList>
                  </CardBody>
                </Card>
              </div>

              {/* ------------------------------------------------- documents */}
              <div className="mt-10">
                <SectionIntro
                  eyebrow="Documents"
                  title="What this agency requires"
                  lede="The baseline list for a standard claim. Your circumstances may add to it, particularly where an owner has died or an entity held title."
                />

                <Card className="mt-5">
                  <CardBody>
                    {jurisdiction.requiredDocuments.length >
                    0 ? (
                      <Checklist
                        items={jurisdiction.requiredDocuments.map(
                          (
                            kind,
                          ) => ({
                            key:
                              kind,

                            label:
                              DOCUMENT_KIND_LABEL[
                                kind
                              ],

                            satisfied:
                              false,

                            blocking:
                              true,
                          }),
                        )}
                      />
                    ) : (
                      <p className="text-md text-ink-500">
                        Document requirements have not yet been recorded for
                        this jurisdiction.
                      </p>
                    )}
                  </CardBody>
                </Card>
              </div>

              {/* -------------------------------------------------- fee rules */}
              <div className="mt-10">
                <SectionIntro
                  eyebrow="Fee rules"
                  title="What a recovery service may charge here"
                />

                <Card className="mt-5">
                  <CardBody>
                    <DataList columns={2}>
                      <DataItem label="Permitted fee models">
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
                          <NotRecorded label="None recorded, intake blocked" />
                        )}
                      </DataItem>

                      <DataItem label="Percentage ceiling">
                        {jurisdiction.feeCapPercent !==
                        undefined ? (
                          `${(
                            jurisdiction.feeCapPercent *
                            100
                          ).toFixed(
                            1,
                          )}%`
                        ) : (
                          <NotRecorded label="No percentage cap recorded" />
                        )}
                      </DataItem>

                      <DataItem label="Amount ceiling">
                        {jurisdiction.feeCapAmount !==
                        undefined ? (
                          formatCents(
                            jurisdiction.feeCapAmount,
                          )
                        ) : (
                          <NotRecorded label="No amount cap recorded" />
                        )}
                      </DataItem>

                      <DataItem label="Cancellation window">
                        {jurisdiction.cancellationPeriodDays !==
                        undefined ? (
                          `${jurisdiction.cancellationPeriodDays} days after signing`
                        ) : (
                          <NotRecorded />
                        )}
                      </DataItem>

                      <DataItem label="Locator license required">
                        {jurisdiction.finderLicenseRequired ? (
                          <Badge tone="caution">
                            Yes
                          </Badge>
                        ) : (
                          "No"
                        )}
                      </DataItem>

                      <DataItem label="Surety bond required">
                        {jurisdiction.bondRequired ? (
                          <Badge tone="caution">
                            Yes
                          </Badge>
                        ) : (
                          "No"
                        )}
                      </DataItem>
                    </DataList>

                    <p className="mt-4 text-sm text-ink-500">
                      See{" "}
                      <TextLink href="/fees">
                        how Duequity fees work
                      </TextLink>{" "}
                      for how a fee is set and capped.
                    </p>
                  </CardBody>
                </Card>
              </div>

              {/* ------------------------------------------------ disclosures */}
              {jurisdiction.disclosures.length >
                0 && (
                <div className="mt-10">
                  <SectionIntro
                    eyebrow="Disclosures"
                    title="What you will be told before signing"
                    lede="Every claimant in this jurisdiction receives these in writing and acknowledges them individually."
                  />

                  <Card className="mt-5">
                    <CardBody>
                      <ul className="space-y-3">
                        {jurisdiction.disclosures.map(
                          (
                            disclosure,
                          ) => (
                            <li
                              key={
                                disclosure.key
                              }
                              className="flex gap-3"
                            >
                              <span
                                aria-hidden="true"
                                className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent-500"
                              />

                              <div className="min-w-0">
                                <p className="text-md leading-relaxed text-ink-700">
                                  {
                                    disclosure.text
                                  }
                                </p>

                                <p className="mt-1 text-2xs text-ink-500">
                                  {disclosureSourceLabel(
                                    disclosure.source,
                                  )}

                                  {disclosure.requiresAcknowledgement
                                    ? ", acknowledgement recorded"
                                    : ""}
                                </p>
                              </div>
                            </li>
                          ),
                        )}
                      </ul>
                    </CardBody>
                  </Card>
                </div>
              )}
            </div>

            {/* ============================================== SIDEBAR: the agency */}
            <aside className="min-w-0 space-y-6">
              <Card elevated>
                <CardHeader
                  title="Contact the agency directly"
                  description="You are not required to use Duequity. These are the agency's own published details."
                />

                <CardBody>
                  <DataList>
                    <DataItem label="Agency">
                      {jurisdiction.agencyName}
                    </DataItem>

                    {jurisdiction.agencyPhone && (
                      <DataItem label="Telephone">
                        <a
                          href={`tel:+1${jurisdiction.agencyPhone.replace(
                            /\D/g,
                            "",
                          )}`}
                          className="font-medium text-accent-700 underline decoration-accent-300 underline-offset-2 hover:text-accent-800"
                        >
                          {formatPhone(
                            jurisdiction.agencyPhone,
                          )}
                        </a>
                      </DataItem>
                    )}

                    {jurisdiction.agencyAddress && (
                      <DataItem label="Mailing address">
                        <span className="block">
                          {
                            jurisdiction.agencyAddress
                              .line1
                          }
                        </span>

                        <span className="block">
                          {
                            jurisdiction.agencyAddress
                              .city
                          }
                          ,{" "}
                          {
                            jurisdiction.agencyAddress
                              .state
                          }{" "}
                          {
                            jurisdiction.agencyAddress
                              .postalCode
                          }
                        </span>
                      </DataItem>
                    )}

                    {jurisdiction.agencyWebsite && (
                      <DataItem label="Website">
                        <TextLink
                          href={
                            jurisdiction.agencyWebsite
                          }
                          external
                        >
                          {
                            new URL(
                              jurisdiction.agencyWebsite,
                            ).hostname
                          }
                        </TextLink>
                      </DataItem>
                    )}

                    {jurisdiction.claimFormUrl && (
                      <DataItem label="Claim form">
                        <TextLink
                          href={
                            jurisdiction.claimFormUrl
                          }
                          external
                        >
                          Download from the agency
                        </TextLink>
                      </DataItem>
                    )}
                  </DataList>
                </CardBody>
              </Card>

              <GovernmentDisclosure
                agencyName={
                  jurisdiction.agencyName
                }
              />

              <Card inset>
                <CardBody>
                  <p className="eyebrow text-ink-500">
                    Compliance record
                  </p>

                  <DataList className="mt-2">
                    <DataItem label="Last legal review">
                      {jurisdiction.lastLegalReview ? (
                        formatDate(
                          jurisdiction.lastLegalReview,
                        )
                      ) : (
                        <NotRecorded label="Not yet reviewed" />
                      )}
                    </DataItem>

                    <DataItem label="Legal rule version">
                      {jurisdiction.legalRuleVersion !==
                      undefined ? (
                        `Version ${jurisdiction.legalRuleVersion}`
                      ) : (
                        <NotRecorded label="Not yet versioned" />
                      )}
                    </DataItem>

                    <DataItem label="Rule package">
                      Version{" "}
                      {
                        jurisdiction.packageVersion
                      }
                    </DataItem>
                  </DataList>

                  <p className="mt-3 text-xs leading-relaxed text-ink-500">
                    Rules are re-reviewed on a schedule and whenever an agency
                    changes its procedure. A lapsed review closes intake until
                    it is renewed.
                  </p>
                </CardBody>
              </Card>
            </aside>
          </div>

          <Prose className="mt-14 max-w-none border-t border-line pt-8">
            <p className="text-sm text-ink-500">
              Nothing on this page is legal advice. The rules shown are the
              rules Duequity has recorded against the official sources named in
              its compliance record, at the review date shown. Agencies change
              their procedures, and you should confirm anything material with
              the agency directly before relying on it.
            </p>
          </Prose>
        </Container>
      </Section>
    </>
  );
}