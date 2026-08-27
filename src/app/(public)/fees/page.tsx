import type { Metadata } from "next";

import { ButtonLink, TextLink } from "@/components/ui/button";
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
  EmptyState,
  GovernmentDisclosure,
} from "@/components/ui/surface";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableRegion,
  TBody,
  TD,
  TH,
  THead,
  TR,
  RecordList,
  RecordListItem,
} from "@/components/ui/table";
import { FEE_MODEL_LABEL } from "@/domain/status";
import { formatCents } from "@/lib/format";
import {
  resolvePublicCoverage,
  type PublicCoverageState,
  type PublicJurisdiction,
} from "@/server/public-jurisdictions";

export const metadata: Metadata = {
  title: "Fees",
  description:
    "How DueQuity service fees are set: one disclosed fee, subject to jurisdiction-specific rules and agreed in writing before recovery work begins. No recovery, no fee.",
};

export const dynamic = "force-dynamic";

/**
 * FEES
 *
 * No fee structure is hard-coded globally, and the direct-claim option is never
 * hidden. This page renders recorded fee rules from persisted jurisdiction rule
 * packages so the public explanation follows the same jurisdiction intelligence
 * used by the operating platform.
 *
 * Payment routing is also jurisdiction-specific. Some authorities pay the
 * claimant, estate, or counsel directly. Others may permit an authorized
 * representative payment route. Fee handling follows the permitted route and
 * the claimant's written agreement.
 *
 * Public visitors cannot run internal property-discovery or claimant-research
 * tooling. DueQuity performs those functions through its controlled operating
 * environment.
 *
 * THE WORKED EXAMPLE IS AN ILLUSTRATION
 *
 * The calculation below uses hypothetical figures only to explain fee arithmetic.
 * It does not represent a particular claimant, recovery, jurisdiction, payment
 * route, or historical DueQuity transaction.
 */

/** Hypothetical approved amount used only to demonstrate the arithmetic. */
const ILLUSTRATIVE_RECOVERY =
  100_000_00;

/** Hypothetical success-fee rate used only to demonstrate the arithmetic. */
const ILLUSTRATIVE_RATE =
  0.12;

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

function jurisdictionTitle(
  jurisdiction: PublicJurisdiction,
): string {
  return jurisdiction.county
    ? `${jurisdiction.county}, ${jurisdiction.stateName}`
    : `${jurisdiction.stateName} (statewide)`;
}

export default async function FeesPage() {
  const coverage =
    await resolvePublicCoverage();

  const jurisdictions =
    coverage.states.flatMap(
      (state) =>
        state.jurisdictions,
    );

  const illustrativeFee =
    Math.round(
      ILLUSTRATIVE_RECOVERY *
        ILLUSTRATIVE_RATE,
    );

  return (
    <>
      <Section
        tone="ink"
        size="sm"
      >
        <Container>
          <p className="eyebrow text-accent-300">
            Fees
          </p>

          <h1 className="mt-3 max-w-3xl text-3xl text-white sm:text-4xl">
            One disclosed fee, governed by your jurisdiction
          </h1>

          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-ink-300">
            You will know the DueQuity fee, how it is calculated, and how the
            permitted payment route affects fee handling before you sign an
            agreement. There are no application fees, no upfront DueQuity
            recovery fees, no monthly charges, and no recovery service fee if
            nothing is recovered.
          </p>
        </Container>
      </Section>

      {/* ============================================================ PRINCIPLES */}
      <Section
        tone="paper"
        size="md"
      >
        <Container>
          <div className="grid gap-6 lg:grid-cols-3">
            <Card>
              <CardBody>
                <p className="eyebrow text-accent-700">
                  No recovery
                </p>

                <p className="mt-2 text-3xl font-semibold text-ink-900">
                  No fee
                </p>

                <p className="mt-2 text-md leading-relaxed text-ink-600">
                  If no amount is recovered, no DueQuity recovery service fee is
                  charged. DueQuity carries its own research and operational
                  costs associated with evaluating the recovery.
                </p>
              </CardBody>
            </Card>

            <Card>
              <CardBody>
                <p className="eyebrow text-accent-700">
                  Nothing upfront
                </p>

                <p className="mt-2 text-3xl font-semibold text-ink-900">
                  $0.00
                </p>

                <p className="mt-2 text-md leading-relaxed text-ink-600">
                  No application fee, retainer, or subscription is required for
                  DueQuity&apos;s recovery service. The applicable service fee
                  becomes due only under the terms stated in your written
                  agreement.
                </p>
              </CardBody>
            </Card>

            <Card>
              <CardBody>
                <p className="eyebrow text-accent-700">
                  Jurisdiction controlled
                </p>

                <p className="mt-2 text-3xl font-semibold text-ink-900">
                  Rules apply
                </p>

                <p className="mt-2 text-md leading-relaxed text-ink-600">
                  Where applicable law limits what a recovery service may
                  charge, the DueQuity fee cannot exceed the permitted limit.
                  Fee models and payment methods are controlled by the rules
                  established for the applicable jurisdiction.
                </p>
              </CardBody>
            </Card>
          </div>
        </Container>
      </Section>

      {/* ========================================================= WORKED EXAMPLE */}
      <Section
        tone="canvas"
        size="md"
      >
        <Container>
          <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_28rem] lg:gap-16">
            <div>
              <SectionIntro
                eyebrow="How the arithmetic runs"
                title="A worked illustration"
                lede="This is an illustration of fee arithmetic, not a record of a claimant or a representation of a particular payment route. Your actual fee and payment structure are stated in your agreement."
              />

              <Prose className="mt-6">
                <p>
                  The illustration below applies a hypothetical percentage
                  service fee to a hypothetical approved recovery amount. Round
                  numbers are used only to make the arithmetic easy to follow.
                </p>

                <p>
                  The fee structure that applies to your recovery is the one
                  permitted for your jurisdiction and recorded in your written
                  agreement. A jurisdiction may permit a percentage fee, a flat
                  fee, another permitted structure, or may restrict or prohibit
                  a particular model entirely.
                </p>

                <p>
                  Payment routing is a separate question. The authority handling
                  the recovery may pay the claimant, estate, or authorized
                  counsel directly, or may permit an authorized representative
                  payment process. DueQuity follows the route permitted for the
                  applicable recovery.
                </p>
              </Prose>

              <Callout
                tone="neutral"
                className="mt-6"
                title="On fee ceilings"
              >
                <p>
                  A statutory or regulatory ceiling is a maximum, not a target.
                  The fee stated in your agreement is the fee that governs,
                  provided it remains within the limits and structures permitted
                  for the applicable jurisdiction.
                </p>
              </Callout>

              <Callout
                tone="caution"
                className="mt-4"
                title="Illustration only"
              >
                <p>
                  The figures shown here are hypothetical. They do not represent
                  a historical DueQuity recovery, a typical recovery amount, or
                  a promise about what any claimant will receive.
                </p>
              </Callout>
            </div>

            <Card elevated>
              <CardHeader
                title="Illustrative recovery calculation"
                description="Hypothetical figures shown only to explain the fee calculation."
                eyebrow="Illustration only"
              />

              <CardBody className="space-y-0">
                <Line
                  label="Illustrative approved recovery"
                  value={
                    formatCents(
                      ILLUSTRATIVE_RECOVERY,
                    )
                  }
                  strong
                />

                <div className="my-3 border-t border-line" />

                <p className="eyebrow mb-2 text-ink-500">
                  DueQuity service fee
                </p>

                <Line
                  label="Illustrative fee model"
                  value="Percentage success fee"
                  muted
                />

                <Line
                  label="Illustrative rate"
                  value={`${(
                    ILLUSTRATIVE_RATE *
                    100
                  ).toFixed(1)}%`}
                  muted
                />

                <Line
                  label="Illustrative fee"
                  value={
                    formatCents(
                      illustrativeFee,
                    )
                  }
                  strong
                  negative
                />

                <div className="my-3 border-t border-line-strong" />

                <div className="flex items-baseline justify-between gap-4">
                  <p className="text-base font-semibold text-ink-900">
                    Illustrative amount after fee
                  </p>

                  <p className="tnum text-2xl font-semibold text-accent-700">
                    {formatCents(
                      ILLUSTRATIVE_RECOVERY -
                        illustrativeFee,
                    )}
                  </p>
                </div>

                <div className="mt-4 rounded-md border border-line bg-inset px-3.5 py-3">
                  <p className="text-xs leading-relaxed text-ink-600">
                    <span className="font-semibold text-ink-800">
                      How this was calculated:
                    </span>{" "}
                    {(
                      ILLUSTRATIVE_RATE *
                      100
                    ).toFixed(
                      1,
                    )}
                    % of{" "}
                    {formatCents(
                      ILLUSTRATIVE_RECOVERY,
                    )}
                    , subject to the fee rules and limits applicable to the
                    actual jurisdiction.
                  </p>
                </div>

                <div className="mt-3 rounded-md border border-line bg-inset px-3.5 py-3">
                  <p className="text-xs leading-relaxed text-ink-600">
                    This calculation does not assume a particular payment route.
                    Where funds are paid directly to the claimant, estate, or
                    counsel, the DueQuity fee may be handled separately under
                    the service agreement. Where an authorized representative
                    payment route permits fee handling through the recovery or
                    disbursement process, that method is disclosed before the
                    claimant authorizes it.
                  </p>
                </div>
              </CardBody>
            </Card>
          </div>
        </Container>
      </Section>

      {/* ============================================================ BY JURISDICTION */}
      <Section
        tone="paper"
        size="md"
      >
        <Container>
          <SectionIntro
            eyebrow="Recorded rules"
            title="What each jurisdiction permits"
            lede="Fee rules are recorded per jurisdiction and enforced by the platform. Where a jurisdiction is not cleared for intake, DueQuity does not offer a recovery fee arrangement for it."
          />

          {jurisdictions.length ===
          0 ? (
            <div className="mt-8">
              <EmptyState
                title="No jurisdiction fee rules are published yet"
                description="Fee rules appear here as jurisdiction-specific requirements are established and approved for public use."
              />
            </div>
          ) : (
            <Card className="mt-8 overflow-hidden">
              <div className="hidden md:block">
                <TableRegion label="Fee rules by jurisdiction">
                  <Table caption="Permitted fee models and recorded caps by jurisdiction">
                    <THead>
                      <TH>
                        Jurisdiction
                      </TH>

                      <TH>
                        Permitted models
                      </TH>

                      <TH align="right">
                        Percentage cap
                      </TH>

                      <TH align="right">
                        Amount cap
                      </TH>

                      <TH align="right">
                        Cancellation
                      </TH>

                      <TH>
                        Intake position
                      </TH>
                    </THead>

                    <TBody>
                      {jurisdictions.map(
                        (
                          jurisdiction,
                        ) => (
                          <TR
                            key={
                              jurisdiction.packageId
                            }
                          >
                            <TD className="font-medium text-ink-900">
                              {jurisdictionTitle(
                                jurisdiction,
                              )}
                            </TD>

                            <TD>
                              <span className="text-ink-600">
                                {jurisdiction
                                  .permittedFeeModels
                                  .length >
                                0
                                  ? jurisdiction.permittedFeeModels
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
                                  : "None recorded"}
                              </span>
                            </TD>

                            <TD
                              align="right"
                              numeric
                            >
                              {jurisdiction.feeCapPercent !==
                              undefined ? (
                                `${(
                                  jurisdiction.feeCapPercent *
                                  100
                                ).toFixed(
                                  1,
                                )}%`
                              ) : (
                                <span className="text-ink-400">
                                  Not recorded
                                </span>
                              )}
                            </TD>

                            <TD
                              align="right"
                              numeric
                            >
                              {jurisdiction.feeCapAmount !==
                              undefined ? (
                                formatCents(
                                  jurisdiction.feeCapAmount,
                                )
                              ) : (
                                <span className="text-ink-400">
                                  Not recorded
                                </span>
                              )}
                            </TD>

                            <TD
                              align="right"
                              numeric
                            >
                              {jurisdiction.cancellationPeriodDays !==
                              undefined ? (
                                `${jurisdiction.cancellationPeriodDays} days`
                              ) : (
                                <span className="text-ink-400">
                                  Not recorded
                                </span>
                              )}
                            </TD>

                            <TD>
                              <Badge
                                tone={
                                  COVERAGE_TONE[
                                    jurisdiction
                                      .coverage
                                  ]
                                }
                              >
                                {
                                  COVERAGE_LABEL[
                                    jurisdiction
                                      .coverage
                                  ]
                                }
                              </Badge>
                            </TD>
                          </TR>
                        ),
                      )}
                    </TBody>
                  </Table>
                </TableRegion>
              </div>

              <div className="md:hidden">
                <RecordList>
                  {jurisdictions.map(
                    (
                      jurisdiction,
                    ) => (
                      <RecordListItem
                        key={
                          jurisdiction.packageId
                        }
                        title={
                          jurisdictionTitle(
                            jurisdiction,
                          )
                        }
                        subtitle={
                          jurisdiction
                            .permittedFeeModels
                            .length >
                          0
                            ? jurisdiction.permittedFeeModels
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
                            : "No fee model recorded"
                        }
                        status={
                          <Badge
                            tone={
                              COVERAGE_TONE[
                                jurisdiction
                                  .coverage
                              ]
                            }
                          >
                            {
                              COVERAGE_LABEL[
                                jurisdiction
                                  .coverage
                              ]
                            }
                          </Badge>
                        }
                        facts={[
                          {
                            label:
                              "Percentage cap",

                            value:
                              jurisdiction.feeCapPercent !==
                              undefined
                                ? `${(
                                    jurisdiction.feeCapPercent *
                                    100
                                  ).toFixed(
                                    1,
                                  )}%`
                                : "Not recorded",
                          },
                          {
                            label:
                              "Amount cap",

                            value:
                              jurisdiction.feeCapAmount !==
                              undefined
                                ? formatCents(
                                    jurisdiction.feeCapAmount,
                                  )
                                : "Not recorded",
                          },
                        ]}
                      />
                    ),
                  )}
                </RecordList>
              </div>
            </Card>
          )}

          <p className="mt-4 text-sm text-ink-500">
            Recorded rules are reviewed against authoritative jurisdiction
            sources before they are used for intake. See{" "}
            <TextLink href="/states">
              where we operate
            </TextLink>
            .
          </p>
        </Container>
      </Section>

      {/* =============================================================== THE FREE OPTION */}
      <Section
        tone="canvas"
        size="md"
      >
        <Container width="reading">
          <SectionIntro
            eyebrow="Your alternative"
            title="You may be able to pursue the recovery yourself"
            lede="Depending on the jurisdiction and your eligibility, you may be able to submit a surplus claim directly to the responsible authority."
          />

          <Prose className="mt-6">
            <p>
              If the applicable jurisdiction allows you to pursue the recovery
              directly, the process generally begins by identifying the
              authority holding the funds and obtaining that authority&apos;s
              current claim procedure.
            </p>

            <ol>
              <li>
                Identify the agency, court, trustee, sheriff, tax authority, or
                other office responsible for the funds.
              </li>

              <li>
                Obtain the current surplus or excess proceeds procedure and any
                required claim forms.
              </li>

              <li>
                Gather the identity, ownership, estate, entity, or other
                supporting documents required for your circumstances.
              </li>

              <li>
                Submit the recovery package through the method permitted by the
                jurisdiction.
              </li>

              <li>
                Track the submission and respond to any additional requests from
                the responsible authority.
              </li>
            </ol>

            <p>
              <strong>
                DueQuity will explain the available direct-claim route where one
                exists.
              </strong>{" "}
              If DueQuity identifies a potential recovery and contacts you, we
              can identify the responsible authority so you can independently
              verify the underlying public record and evaluate your options.
            </p>

            <p>
              DueQuity&apos;s service is the work of identifying potential
              recoveries, researching jurisdiction requirements, locating and
              coordinating claimants, organizing documents, preparing recovery
              packages, handling permitted administrative steps, coordinating
              probate-related or heir documentation, involving licensed counsel
              where legal work is required, and tracking the matter through the
              appropriate payment process.
            </p>

            <p>
              DueQuity provides these services as an optional recovery solution,
              subject to the requirements and payment route established for the
              applicable jurisdiction.
            </p>
          </Prose>

          <GovernmentDisclosure className="mt-8" />
        </Container>
      </Section>

      {/* ================================================================ BOUNDARIES */}
      <Section
        tone="paper"
        size="md"
      >
        <Container>
          <SectionIntro
            eyebrow="Boundaries"
            title="Things DueQuity will not do"
            lede="These are standing boundaries of the DueQuity recovery model."
          />

          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                title:
                  "Buy your claim",

                body:
                  "We do not purchase surplus claims, take assignments of surplus ownership rights, or acquire an ownership interest in your recovery.",
              },
              {
                title:
                  "Ignore the payment rules",

                body:
                  "We do not impose one payment route everywhere. We follow the direct-payment or authorized-representative route permitted for the applicable jurisdiction.",
              },
              {
                title:
                  "Charge an undisclosed fee",

                body:
                  "The DueQuity fee, its calculation, applicable limits, and permitted handling method are disclosed in writing before you enter into the service agreement.",
              },
              {
                title:
                  "Share in attorney fees",

                body:
                  "Any attorney-client relationship is separate from DueQuity. We do not share in fees charged by independent counsel.",
              },
              {
                title:
                  "Guarantee a recovery",

                body:
                  "DueQuity cannot guarantee approval, timing, or a particular recovery amount. The responsible authority determines whether a claim is approved.",
              },
              {
                title:
                  "Pressure you to sign",

                body:
                  "DueQuity does not rely on artificial countdowns, fabricated deadlines, or claims that you must hire us in order to recover funds that you may be entitled to pursue independently.",
              },
            ].map(
              (item) => (
                <div
                  key={
                    item.title
                  }
                  className="rounded-lg border border-line bg-inset p-4"
                >
                  <div className="flex items-start gap-2.5">
                    <Badge
                      tone="critical"
                      className="mt-0.5"
                    >
                      Never
                    </Badge>
                  </div>

                  <h3 className="mt-2.5 font-sans text-base font-semibold text-ink-900">
                    {item.title}
                  </h3>

                  <p className="mt-1.5 text-sm leading-relaxed text-ink-600">
                    {item.body}
                  </p>
                </div>
              ),
            )}
          </div>
        </Container>
      </Section>

      <Section
        tone="sunken"
        size="sm"
      >
        <Container
          width="narrow"
          className="text-center"
        >
          <h2 className="text-2xl">
            Understand the process before you decide
          </h2>

          <p className="mt-3 text-lg leading-relaxed text-ink-600">
            If DueQuity contacts you about a potential surplus recovery, we will
            identify the source, responsible authority, applicable fee, and
            jurisdiction-specific recovery requirements before you decide
            whether to work with us.
          </p>

          <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
            <ButtonLink
              href="/how-it-works"
              variant="primary"
              accent
              size="lg"
            >
              How DueQuity works
            </ButtonLink>

            <ButtonLink
              href="/contact"
              size="lg"
            >
              Contact DueQuity
            </ButtonLink>
          </div>
        </Container>
      </Section>
    </>
  );
}

function Line({
  label,
  value,
  strong = false,
  muted = false,
  negative = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
  muted?: boolean;
  negative?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <span
        className={
          strong
            ? "text-base font-medium text-ink-900"
            : "text-sm text-ink-600"
        }
      >
        {negative && (
          <span
            aria-hidden="true"
            className="mr-1 text-ink-400"
          >
            less
          </span>
        )}

        {label}
      </span>

      <span
        className={
          muted
            ? "tnum shrink-0 text-sm text-ink-500"
            : strong
              ? "tnum shrink-0 text-base font-semibold text-ink-900"
              : "tnum shrink-0 text-sm text-ink-800"
        }
      >
        {value}
      </span>
    </div>
  );
}