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
    "How Duequity service fees are set: one disclosed fee, capped by the rules of the jurisdiction, agreed in writing before any work begins. No recovery, no fee.",
};

export const dynamic = "force-dynamic";

/**
 * FEES
 *
 * No fee structure is hard coded globally, and the free claim option is never
 * hidden. This page renders the recorded caps from persisted jurisdiction rule
 * packages, so the ceilings shown are the ceilings the platform enforces.
 *
 * THE WORKED EXAMPLE IS AN ILLUSTRATION
 *
 * The calculation shown is arithmetic on hypothetical figures and is labelled as
 * such. Duequity has not completed a recovery, and this page does not present an
 * invented case as though it had. A claimant deciding whether to sign needs to
 * understand the order of operations; they do not need a fabricated success story.
 */

/** Hypothetical approved amount used only to demonstrate the arithmetic. */
const ILLUSTRATIVE_RECOVERY = 100_000_00;

/** Hypothetical success-fee rate used only to demonstrate the arithmetic. */
const ILLUSTRATIVE_RATE = 0.12;

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

function jurisdictionTitle(jurisdiction: PublicJurisdiction): string {
  return jurisdiction.county
    ? `${jurisdiction.county}, ${jurisdiction.stateName}`
    : `${jurisdiction.stateName} (statewide)`;
}

export default async function FeesPage() {
  const coverage = await resolvePublicCoverage();

  const jurisdictions = coverage.states.flatMap((state) => state.jurisdictions);

  const illustrativeFee = Math.round(ILLUSTRATIVE_RECOVERY * ILLUSTRATIVE_RATE);

  return (
    <>
      <Section tone="ink" size="sm">
        <Container>
          <p className="eyebrow text-accent-300">Fees</p>
          <h1 className="mt-3 max-w-3xl text-3xl text-white sm:text-4xl">
            One disclosed fee, capped by your jurisdiction
          </h1>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-ink-300">
            You will know the exact fee and how it is calculated before you sign
            anything. There are no application fees, no upfront costs, no
            monthly charges, and no fee at all if nothing is recovered.
          </p>
        </Container>
      </Section>

      {/* ============================================================ PRINCIPLES */}
      <Section tone="paper" size="md">
        <Container>
          <div className="grid gap-6 lg:grid-cols-3">
            <Card>
              <CardBody>
                <p className="eyebrow text-accent-700">No recovery</p>
                <p className="mt-2 text-3xl font-semibold text-ink-900">
                  No fee
                </p>
                <p className="mt-2 text-md leading-relaxed text-ink-600">
                  If your claim is not approved, or the agency pays nothing, you
                  owe Duequity nothing. We carry the research cost.
                </p>
              </CardBody>
            </Card>
            <Card>
              <CardBody>
                <p className="eyebrow text-accent-700">Nothing upfront</p>
                <p className="mt-2 text-3xl font-semibold text-ink-900">
                  $0.00
                </p>
                <p className="mt-2 text-md leading-relaxed text-ink-600">
                  No search fee, no application fee, no retainer, no
                  subscription. We do not ask you for money before an agency has
                  paid you.
                </p>
              </CardBody>
            </Card>
            <Card>
              <CardBody>
                <p className="eyebrow text-accent-700">Capped by law</p>
                <p className="mt-2 text-3xl font-semibold text-ink-900">
                  Jurisdiction set
                </p>
                <p className="mt-2 text-md leading-relaxed text-ink-600">
                  Where a state or county caps what a recovery service may
                  charge, our system enforces that cap. It cannot be exceeded by
                  agreement.
                </p>
              </CardBody>
            </Card>
          </div>
        </Container>
      </Section>

      {/* ========================================================= WORKED EXAMPLE */}
      <Section tone="canvas" size="md">
        <Container>
          <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_28rem] lg:gap-16">
            <div>
              <SectionIntro
                eyebrow="How the arithmetic runs"
                title="A worked illustration"
                lede="This is an illustration of the calculation, not a record of anyone's claim. Your own figures appear in your agreement and again on your closing statement."
              />

              <Prose className="mt-6">
                <p>
                  The illustration below applies a capped success fee to a
                  hypothetical approved amount. It uses round numbers on
                  purpose: it is here to show the order of operations, not to
                  suggest a typical recovery.
                </p>
                <p>
                  The ceiling that applies to you is the one recorded for your
                  jurisdiction. In a jurisdiction with a lower ceiling, the
                  lower figure applies. In a jurisdiction that permits only a
                  flat fee, a percentage cannot be used at all. In a
                  jurisdiction we have not cleared, we do not take the claim.
                </p>
              </Prose>

              <Callout tone="neutral" className="mt-6" title="On the fee cap">
                <p>
                  A cap is not a target. Where a matter is straightforward we
                  may charge less than the ceiling, and the figure in your
                  agreement is the figure that governs. The cap exists so that
                  no agreement can quietly exceed what your jurisdiction
                  permits.
                </p>
              </Callout>

              <Callout
                tone="caution"
                className="mt-4"
                title="No completed recovery is being shown"
              >
                <p>
                  Duequity has not yet completed a recovery. This page will not
                  present an invented case as evidence that it has. The
                  illustration is arithmetic only.
                </p>
              </Callout>
            </div>

            <Card elevated>
              <CardHeader
                title="Illustrative settlement statement"
                description="Hypothetical figures shown to explain the calculation."
                eyebrow="Illustration only"
              />
              <CardBody className="space-y-0">
                <Line
                  label="Amount approved by the agency"
                  value={formatCents(ILLUSTRATIVE_RECOVERY)}
                  strong
                />
                <Line
                  label="Paid by the agency directly to the claimant"
                  value={formatCents(ILLUSTRATIVE_RECOVERY)}
                  muted
                />

                <div className="my-3 border-t border-line" />

                <p className="eyebrow mb-2 text-ink-500">
                  Duequity service fee
                </p>
                <Line label="Fee model" value="Capped success fee" muted />
                <Line
                  label="Illustrative rate"
                  value={`${(ILLUSTRATIVE_RATE * 100).toFixed(1)}%`}
                  muted
                />
                <Line
                  label="Fee charged"
                  value={formatCents(illustrativeFee)}
                  strong
                  negative
                />

                <div className="my-3 border-t border-line-strong" />

                <div className="flex items-baseline justify-between gap-4">
                  <p className="text-base font-semibold text-ink-900">
                    Net to the claimant
                  </p>
                  <p className="tnum text-2xl font-semibold text-accent-700">
                    {formatCents(ILLUSTRATIVE_RECOVERY - illustrativeFee)}
                  </p>
                </div>

                <div className="mt-4 rounded-md border border-line bg-inset px-3.5 py-3">
                  <p className="text-xs leading-relaxed text-ink-600">
                    <span className="font-semibold text-ink-800">
                      How this was calculated:
                    </span>{" "}
                    {(ILLUSTRATIVE_RATE * 100).toFixed(1)}% of{" "}
                    {formatCents(ILLUSTRATIVE_RECOVERY)}, subject to whatever
                    ceiling the recorded jurisdiction rule imposes.
                  </p>
                </div>

                <div className="mt-3 rounded-md border border-line bg-inset px-3.5 py-3">
                  <p className="text-xs leading-relaxed text-ink-600">
                    The agency pays the approved amount to the claimant.
                    Duequity invoices its fee separately after payment clears.
                    Duequity does not receive, hold, or deduct from an agency
                    disbursement at any point.
                  </p>
                </div>
              </CardBody>
            </Card>
          </div>
        </Container>
      </Section>

      {/* ============================================================ BY JURISDICTION */}
      <Section tone="paper" size="md">
        <Container>
          <SectionIntro
            eyebrow="Recorded rules"
            title="What each jurisdiction permits"
            lede="Fee rules are recorded per jurisdiction and enforced by the platform. Where a jurisdiction is not cleared for intake, no fee arrangement is available at all."
          />

          {jurisdictions.length === 0 ? (
            <div className="mt-8">
              <EmptyState
                title="No jurisdiction fee rules are published yet"
                description="Fee rules appear here per jurisdiction as each one completes legal review. Until a jurisdiction is activated, no fee arrangement is offered in it and none is shown here."
              />
            </div>
          ) : (
            <Card className="mt-8 overflow-hidden">
              {/* Desktop table */}
              <div className="hidden md:block">
                <TableRegion label="Fee rules by jurisdiction">
                  <Table caption="Permitted fee models and recorded caps by jurisdiction">
                    <THead>
                      <TH>Jurisdiction</TH>
                      <TH>Permitted models</TH>
                      <TH align="right">Percentage cap</TH>
                      <TH align="right">Amount cap</TH>
                      <TH align="right">Cancellation</TH>
                      <TH>Intake position</TH>
                    </THead>
                    <TBody>
                      {jurisdictions.map((jurisdiction) => (
                        <TR key={jurisdiction.packageId}>
                          <TD className="font-medium text-ink-900">
                            {jurisdictionTitle(jurisdiction)}
                          </TD>
                          <TD>
                            <span className="text-ink-600">
                              {jurisdiction.permittedFeeModels.length > 0
                                ? jurisdiction.permittedFeeModels
                                    .map((model) => FEE_MODEL_LABEL[model])
                                    .join(", ")
                                : "None recorded"}
                            </span>
                          </TD>
                          <TD align="right" numeric>
                            {jurisdiction.feeCapPercent !== undefined ? (
                              `${(jurisdiction.feeCapPercent * 100).toFixed(1)}%`
                            ) : (
                              <span className="text-ink-400">Not recorded</span>
                            )}
                          </TD>
                          <TD align="right" numeric>
                            {jurisdiction.feeCapAmount !== undefined ? (
                              formatCents(jurisdiction.feeCapAmount)
                            ) : (
                              <span className="text-ink-400">Not recorded</span>
                            )}
                          </TD>
                          <TD align="right" numeric>
                            {jurisdiction.cancellationPeriodDays !==
                            undefined ? (
                              `${jurisdiction.cancellationPeriodDays} days`
                            ) : (
                              <span className="text-ink-400">Not recorded</span>
                            )}
                          </TD>
                          <TD>
                            <Badge tone={COVERAGE_TONE[jurisdiction.coverage]}>
                              {COVERAGE_LABEL[jurisdiction.coverage]}
                            </Badge>
                          </TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                </TableRegion>
              </div>

              {/* Mobile list */}
              <div className="md:hidden">
                <RecordList>
                  {jurisdictions.map((jurisdiction) => (
                    <RecordListItem
                      key={jurisdiction.packageId}
                      title={jurisdictionTitle(jurisdiction)}
                      subtitle={
                        jurisdiction.permittedFeeModels.length > 0
                          ? jurisdiction.permittedFeeModels
                              .map((model) => FEE_MODEL_LABEL[model])
                              .join(", ")
                          : "No fee model recorded"
                      }
                      status={
                        <Badge tone={COVERAGE_TONE[jurisdiction.coverage]}>
                          {COVERAGE_LABEL[jurisdiction.coverage]}
                        </Badge>
                      }
                      facts={[
                        {
                          label: "Percentage cap",
                          value:
                            jurisdiction.feeCapPercent !== undefined
                              ? `${(jurisdiction.feeCapPercent * 100).toFixed(1)}%`
                              : "Not recorded",
                        },
                        {
                          label: "Amount cap",
                          value:
                            jurisdiction.feeCapAmount !== undefined
                              ? formatCents(jurisdiction.feeCapAmount)
                              : "Not recorded",
                        },
                      ]}
                    />
                  ))}
                </RecordList>
              </div>
            </Card>
          )}

          <p className="mt-4 text-sm text-ink-500">
            Recorded rules are reviewed against official sources before a
            jurisdiction is activated, and the review date is shown on each
            jurisdiction page. See{" "}
            <TextLink href="/states">where we operate</TextLink>.
          </p>
        </Container>
      </Section>

      {/* =============================================================== THE FREE OPTION */}
      <Section tone="canvas" size="md">
        <Container width="reading">
          <SectionIntro
            eyebrow="Your alternative"
            title="You can do this yourself, and here is how"
            lede="We are not going to bury this. In most jurisdictions a former owner or eligible heir can file a surplus claim directly with the agency and pay no service fee at all."
          />

          <Prose className="mt-6">
            <p>
              If you want to pursue a claim on your own, the process generally
              looks like this:
            </p>
            <ol>
              <li>
                Identify which agency holds the funds. This is usually the clerk
                of court, the county treasurer or tax collector, the sheriff,
                the trustee, or the state unclaimed property office.
              </li>
              <li>
                Ask that agency for its surplus or excess proceeds claim
                procedure and its claim form.
              </li>
              <li>
                Gather the documents on their list, which typically includes
                identification and proof of former ownership.
              </li>
              <li>Submit the claim by the method the agency specifies.</li>
              <li>Follow up, and keep a record of every contact.</li>
            </ol>
            <p>
              <strong>
                We will help you do this even if you do not hire us.
              </strong>{" "}
              If you search a property on Duequity and decide to proceed alone,
              we will tell you which agency holds the funds and give you their
              published contact details. That is part of how we operate, not a
              concession.
            </p>
            <p>
              What we offer instead is the work: locating the record in the
              first place, jurisdiction expertise, obtaining documents that are
              difficult to get, handling probate and heir situations,
              coordinating counsel where a court process is required, and
              following the claim through to payment. Whether that is worth a
              fee is your judgement to make, and you should make it with the
              free option clearly in view.
            </p>
          </Prose>

          <GovernmentDisclosure className="mt-8" />
        </Container>
      </Section>

      {/* ================================================================ WHAT WE DONT DO */}
      <Section tone="paper" size="md">
        <Container>
          <SectionIntro
            eyebrow="Boundaries"
            title="Things Duequity will not do"
            lede="Much of the harm in this industry comes from arrangements that look like a service and function as something else. These are commitments, not preferences."
          />

          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                title: "Buy your claim",
                body: "We do not purchase surplus claims or take assignments of your rights at a discount to their value.",
              },
              {
                title: "Hold your money",
                body: "We are never a payee on an agency disbursement. We do not deposit or endorse claimant instruments.",
              },
              {
                title: "Charge a fee you have not seen",
                body: "The fee, its basis and its cap are in your agreement before you sign, and on your closing statement afterwards.",
              },
              {
                title: "Share in attorney fees",
                body: "Where counsel is needed you engage them directly. We take no part of their fee and no referral payment.",
              },
              {
                title: "Guarantee a recovery",
                body: "No one can. Agencies decide claims, liens can consume a surplus, and deadlines can already have passed.",
              },
              {
                title: "Pressure you to sign",
                body: "No countdown timers, no expiring offers, no implication that a delay costs you the money.",
              },
            ].map((item) => (
              <div
                key={item.title}
                className="rounded-lg border border-line bg-inset p-4"
              >
                <div className="flex items-start gap-2.5">
                  <Badge tone="critical" className="mt-0.5">
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
            ))}
          </div>
        </Container>
      </Section>

      <Section tone="sunken" size="sm">
        <Container width="narrow" className="text-center">
          <h2 className="text-2xl">See whether there is anything to claim</h2>
          <p className="mt-3 text-lg leading-relaxed text-ink-600">
            No fee applies to a search, and no agreement is signed until you
            have seen the record and the exact fee that would apply to your
            jurisdiction.
          </p>
          <div className="mt-6 flex justify-center">
            <ButtonLink href="/check" variant="primary" accent size="lg">
              Check a property
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
          strong ? "text-base font-medium text-ink-900" : "text-sm text-ink-600"
        }
      >
        {negative && (
          <span aria-hidden="true" className="mr-1 text-ink-400">
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
