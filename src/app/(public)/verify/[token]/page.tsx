import type { Metadata } from "next";

import { notFound } from "next/navigation";

import {
  Container,
  Section,
} from "@/components/public/section";

import {
  Card,
  CardBody,
  DataItem,
  DataList,
  GovernmentDisclosure,
  NotRecorded,
} from "@/components/ui/surface";

import {
  Identifier,
} from "@/components/ui/badge";

import {
  Breadcrumbs,
} from "@/components/ui/tabs";

import {
  TextLink,
} from "@/components/ui/button";

import {
  ClaimNextSteps,
} from "@/components/public/claim-next-steps";

import {
  SurplusStatusBadge,
} from "@/components/public/match-card";

import {
  getPublicMatch,
} from "@/server/public-search";

import {
  listJurisdictionRulePackages,
} from "@/server/jurisdiction-intelligence";

import {
  requiredDisclosures,
} from "@/domain/compliance";

import {
  CUSTODIAN_LABEL,
  SALE_TYPE_LABEL,
} from "@/domain/status";

import {
  formatDate,
  formatPhone,
} from "@/lib/format";

export const dynamic =
  "force-dynamic";

/* ========================================================================== */
/* Helpers                                                                     */
/* ========================================================================== */

function slugify(
  value: string,
): string {
  return value
    .toLowerCase()
    .replace(
      /['’]/g,
      "",
    )
    .replace(
      /[^a-z0-9]+/g,
      "-",
    )
    .replace(
      /^-+|-+$/g,
      "",
    );
}

function phoneHref(
  phone: string,
): string {
  const digits =
    phone.replace(
      /\D/g,
      "",
    );

  if (
    digits.length ===
    10
  ) {
    return `tel:+1${digits}`;
  }

  if (
    digits.length ===
      11 &&
    digits.startsWith(
      "1",
    )
  ) {
    return `tel:+${digits}`;
  }

  return `tel:${digits}`;
}

/* ========================================================================== */
/* Metadata                                                                    */
/* ========================================================================== */

export async function generateMetadata({
  params,
}: PageProps<"/verify/[token]">): Promise<Metadata> {
  const {
    token,
  } =
    await params;

  const match =
    await getPublicMatch(
      token,
    );

  if (
    !match
  ) {
    return {
      title:
        "Record not found",

      robots: {
        index:
          false,

        follow:
          false,
      },
    };
  }

  return {
    title:
      `Review record, ${match.city}, ${match.state}`,

    description:
      "Review a Duequity surplus-recovery record and continue only if the property is connected to you.",

    robots: {
      index:
        false,

      follow:
        false,
    },
  };
}

/* ========================================================================== */
/* Page                                                                        */
/* ========================================================================== */

export default async function VerifyRecordPage({
  params,
}: PageProps<"/verify/[token]">) {
  const {
    token,
  } =
    await params;

  const match =
    await getPublicMatch(
      token,
    );

  if (
    !match
  ) {
    notFound();
  }

  /*
   * A secure verification link may use only an approved jurisdiction rule.
   * Draft or unresolved legal research must never drive claimant instructions.
   *
   * This route does not provide public property discovery. It is reached through
   * a specific verification token associated with a record Duequity has already
   * identified through its staff-only research workflow.
   */
  const jurisdictionPackages =
    await listJurisdictionRulePackages();

  const jurisdiction =
    jurisdictionPackages
      .filter(
        (
          rulePackage,
        ) =>
          rulePackage.status ===
            "approved" &&
          Boolean(
            rulePackage.rule,
          ),
      )
      .map(
        (
          rulePackage,
        ) =>
          rulePackage.rule,
      )
      .find(
        (
          rule,
        ) => {
          if (
            !rule
          ) {
            return false;
          }

          const stateSlug =
            rule.state.toLowerCase();

          const countySlug =
            slugify(
              rule.county ??
                "statewide",
            );

          return (
            stateSlug ===
              match.jurisdictionSlug
                .state &&
            countySlug ===
              match.jurisdictionSlug
                .county
          );
        },
      );

  if (
    !jurisdiction
  ) {
    notFound();
  }

  const disclosures =
    requiredDisclosures(
      jurisdiction,
    );

  return (
    <>
      {/* ================================================================ intro */}
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
                  "/",

                label:
                  "Duequity",
              },
              {
                label:
                  "Review record",
              },
            ]}
          />

          <div className="mt-4 max-w-2xl">
            <p className="eyebrow text-accent-300">
              Relationship review
            </p>

            <h1 className="mt-3 text-3xl text-white sm:text-4xl">
              Are you connected to this property?
            </h1>

            <p className="mt-4 text-lg leading-relaxed text-ink-300">
              Surplus funds generally belong to the former owner or another
              person or entity legally entitled through that owner. Tell us how
              you are connected to the property so the appropriate recovery path
              can be evaluated.
            </p>
          </div>
        </Container>
      </Section>

      {/* ================================================================ body */}
      <Section
        tone="paper"
        size="sm"
      >
        <Container>
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_21rem] lg:gap-14">
            {/* ========================================================== intake */}
            <div className="min-w-0">
              <ClaimNextSteps
                jurisdictionName={
                  jurisdiction.county
                    ? `${jurisdiction.county}, ${jurisdiction.stateName}`
                    : jurisdiction.stateName
                }
                agencyName={
                  jurisdiction.agencyName
                }
                intake={
                  match.intake
                }
                intakeExplanation={
                  match.intakeExplanation
                }
                probateRequired={
                  jurisdiction.probateRequiredWhenDeceased
                }
                requiredDocuments={
                  jurisdiction.requiredDocuments
                }
                disclosures={disclosures.map(
                  (
                    disclosure,
                  ) => ({
                    key:
                      disclosure.key,

                    text:
                      disclosure.text,

                    requiresAcknowledgement:
                      disclosure.requiresAcknowledgement,
                  }),
                )}
                jurisdictionHref={`/states/${match.jurisdictionSlug.state}/${match.jurisdictionSlug.county}`}
              />
            </div>

            {/* ====================================================== record proof */}
            <aside className="min-w-0 space-y-6">
              <Card
                elevated
                className="lg:sticky lg:top-24"
              >
                <CardBody>
                  <div>
                    <p className="eyebrow text-ink-500">
                      Verified source record
                    </p>

                    <p className="mt-1.5 text-base font-semibold text-ink-900">
                      {
                        match.addressMasked
                      }
                    </p>

                    <p className="text-sm text-ink-600">
                      {match.city},{" "}
                      {match.state}{" "}
                      {
                        match.postalCodePrefix
                      }
                      xx
                    </p>
                  </div>

                  <div className="mt-3">
                    <SurplusStatusBadge
                      status={
                        match.surplusStatus
                      }
                    />
                  </div>

                  <DataList className="mt-4 border-t border-line-subtle pt-3">
                    <DataItem label="County">
                      {match.county},{" "}
                      {match.state}
                    </DataItem>

                    <DataItem label="Sale type">
                      {
                        SALE_TYPE_LABEL[
                          match.saleType
                        ]
                      }
                    </DataItem>

                    <DataItem label="Sale date">
                      {formatDate(
                        match.saleDate,
                      )}
                    </DataItem>

                    <DataItem label="Case number">
                      {match.caseNumber ? (
                        <Identifier>
                          {
                            match.caseNumber
                          }
                        </Identifier>
                      ) : (
                        <NotRecorded />
                      )}
                    </DataItem>

                    <DataItem label="Funds custodian">
                      {
                        match.agencyName
                      }
                    </DataItem>

                    <DataItem label="Custodian type">
                      {
                        CUSTODIAN_LABEL[
                          match.custodian
                        ]
                      }
                    </DataItem>

                    {match.claimDeadline && (
                      <DataItem label="Recorded deadline">
                        {formatDate(
                          match.claimDeadline,
                        )}
                      </DataItem>
                    )}
                  </DataList>

                  {/* ============================================== verification */}
                  <div className="mt-4 rounded-md border border-line bg-inset px-3.5 py-3">
                    <p className="text-xs font-semibold text-ink-800">
                      Verify independently
                    </p>

                    <p className="mt-1 text-xs leading-relaxed text-ink-600">
                      Duequity&apos;s record identifies{" "}
                      {match.sourceName}

                      {match.sourceReference && (
                        <>
                          {" "}
                          under reference{" "}
                          <span className="font-mono">
                            {
                              match.sourceReference
                            }
                          </span>
                        </>
                      )}
                      .
                    </p>

                    <div className="mt-2 space-y-1.5">
                      {match.agencyPhone && (
                        <p className="text-xs">
                          <a
                            href={phoneHref(
                              match.agencyPhone,
                            )}
                            className="font-medium text-accent-700 underline decoration-accent-300 underline-offset-2 hover:text-accent-800"
                          >
                            Call the agency:{" "}
                            {formatPhone(
                              match.agencyPhone,
                            )}
                          </a>
                        </p>
                      )}

                      {match.sourceUrl && (
                        <p className="text-xs">
                          <TextLink
                            href={
                              match.sourceUrl
                            }
                            external
                            className="text-xs"
                          >
                            Open public source
                          </TextLink>
                        </p>
                      )}

                      <p className="text-xs">
                        <TextLink
                          href={`/states/${match.jurisdictionSlug.state}/${match.jurisdictionSlug.county}`}
                          className="text-xs"
                        >
                          Review this jurisdiction
                        </TextLink>
                      </p>
                    </div>
                  </div>

                  {/* ============================================== amount privacy */}
                  <div className="mt-3 rounded-md border border-line bg-paper px-3.5 py-3">
                    <p className="text-xs leading-relaxed text-ink-600">
                      <span className="font-semibold text-ink-900">
                        Recovery amounts are not shown on this verification
                        page.
                      </span>{" "}
                      Duequity keeps claimant-sensitive recovery information
                      inside the appropriate secured claim and onboarding
                      workflows.
                    </p>
                  </div>
                </CardBody>
              </Card>

              <GovernmentDisclosure
                agencyName={
                  match.agencyName
                }
              />

              {/* ==================================================== information */}
              <Card inset>
                <CardBody>
                  <p className="eyebrow text-ink-500">
                    Before you continue
                  </p>

                  <p className="mt-2 text-xs leading-relaxed text-ink-600">
                    Review the requested fields before submitting them. Do not
                    provide bank account information or a Social Security number
                    unless a later, verified claim workflow specifically
                    requires it and explains why.
                  </p>

                  <p className="mt-2 text-xs">
                    <TextLink
                      href="/security"
                      className="text-xs"
                    >
                      Security information
                    </TextLink>
                  </p>
                </CardBody>
              </Card>
            </aside>
          </div>
        </Container>
      </Section>
    </>
  );
}