import Link from "next/link";

import { ButtonLink, TextLink } from "@/components/ui/button";
import {
  Container,
  Section,
  SectionIntro,
  Step,
} from "@/components/public/section";
import { Badge } from "@/components/ui/badge";
import {
  IconArrowRight,
  IconCheck,
  IconDocument,
  IconJurisdiction,
  IconLock,
  IconSearch,
  IconShield,
} from "@/components/ui/icon";
import { formatCount } from "@/lib/format";
import { resolvePublicCoverage } from "@/server/public-jurisdictions";

/**
 * HOMEPAGE
 *
 * Section 29 sets the standard: communicate what Duequity does immediately, make a
 * sophisticated promise without sounding sensational, and never use the language of
 * a lead generation funnel.
 *
 * The hero states a fact about property sales, not a promise about money. "Property
 * sold. Equity may remain." is a true statement about the world; "You may be owed
 * thousands" is a hook. The difference is the whole brand.
 *
 * Duequity does not expose property-search or surplus-discovery tools to public
 * visitors. Staff performs discovery and claimant research internally. A claimant
 * receives access only after Duequity has established a legitimate lead, made
 * contact, and initiated secure onboarding.
 */

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const coverage =
    await resolvePublicCoverage();

  const states =
    coverage.states;

  const countyCount =
    coverage.totals.counties;

  return (
    <>
      {/* ================================================================ HERO */}
      <section className="relative overflow-hidden border-b border-ink-800 bg-ink-950">
        {/*
          Background treatment: a fine surveyor's grid, at very low contrast. It
          reads as a plat map or a ledger rather than as decoration, and it carries
          no meaning that would be lost if it failed to render.
        */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)",
            backgroundSize:
              "72px 72px",
          }}
        />

        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-40 -right-32 size-[36rem] rounded-full bg-accent-800/20 blur-3xl"
        />

        <Container className="relative">
          <div className="grid items-center gap-12 py-16 sm:py-20 lg:grid-cols-[minmax(0,1fr)_26rem] lg:gap-16 lg:py-28">
            <div className="max-w-2xl">
              <p className="eyebrow text-accent-300">
                National property surplus recovery
              </p>

              <h1 className="mt-4 text-4xl text-white sm:text-5xl">
                Property sold.
                <br />
                Equity may remain.
              </h1>

              <p className="mt-5 max-w-xl text-lg leading-relaxed text-ink-300">
                When a property sells at foreclosure or tax sale for more than
                the debt against it, the difference does not belong to the
                lender or the county. It belongs to the former owner or their
                heirs. Duequity helps identify and recover it.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <ButtonLink
                  href="/how-it-works"
                  variant="primary"
                  accent
                  size="lg"
                  trailing={
                    <IconArrowRight
                      size={18}
                    />
                  }
                >
                  How Duequity works
                </ButtonLink>

                <ButtonLink
                  href="/claimant/sign-in"
                  size="lg"
                  className="border-ink-700 bg-transparent text-ink-100 hover:border-ink-500 hover:bg-ink-900 hover:text-white"
                >
                  Claimant sign in
                </ButtonLink>
              </div>

              <p className="mt-5 max-w-xl text-sm leading-relaxed text-ink-400">
                Duequity identifies potential surplus records from official
                public sources. If we contact you about a record, we will show
                you the source and responsible agency so you can verify it
                independently before deciding whether to proceed.
              </p>
            </div>

            {/*
              The proof card shows what verification looks like before a claimant
              is asked to proceed. Deliberately a real record shape, not an
              illustration.
            */}
            <div className="lg:justify-self-end">
              <div className="rounded-xl border border-ink-800 bg-ink-900/80 p-5 shadow-lg backdrop-blur-sm">
                <div className="flex items-center justify-between gap-3">
                  <p className="eyebrow text-ink-400">
                    What a verified record shows
                  </p>
                </div>

                <div className="mt-4 space-y-3.5 border-t border-ink-800 pt-4">
                  <Row label="Former property">
                    The street address on the recorded instrument
                  </Row>

                  <Row label="County">
                    The county and state that conducted the sale
                  </Row>

                  <Row
                    label="Case number"
                    mono
                  >
                    The public case or list reference we relied on
                  </Row>

                  <Row label="Sale date">
                    The date the sale actually took place
                  </Row>

                  <Row label="Funds held by">
                    The named agency currently holding the surplus
                  </Row>

                  <div className="flex items-baseline justify-between gap-3 pt-1">
                    <span className="text-xs text-ink-400">
                      Surplus status
                    </span>

                    <Badge
                      tone="neutral"
                      size="md"
                    >
                      Estimated until the agency confirms
                    </Badge>
                  </div>
                </div>

                <div className="mt-4 rounded-md border border-ink-800 bg-ink-950/60 px-3.5 py-3">
                  <p className="text-xs leading-relaxed text-ink-400">
                    Every Duequity record presented to a potential claimant
                    identifies the public source and the agency that holds the
                    funds, so the information can be verified independently.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </Container>
      </section>

      {/* ====================================================== WHAT THIS IS */}
      <Section
        tone="paper"
        size="md"
      >
        <Container>
          <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-20">
            <div>
              <SectionIntro
                eyebrow="What surplus funds are"
                title="The money left over after a sale"
                lede="A property sale settles a debt. When it raises more than the debt, taxes and costs, the remainder is surplus, and the former owner or their heirs are usually the ones entitled to it."
              />

              <div className="mt-8 rounded-lg border border-line bg-inset p-5">
                <p className="eyebrow text-ink-500">
                  A simplified example
                </p>

                <dl className="mt-3 space-y-2 text-md">
                  <Figure
                    label="Property sold at auction"
                    value="$315,000"
                  />

                  <Figure
                    label="Mortgage debt satisfied"
                    value="$241,800"
                    negative
                  />

                  <Figure
                    label="Delinquent taxes"
                    value="$11,420"
                    negative
                  />

                  <Figure
                    label="Sale costs and fees"
                    value="$18,090"
                    negative
                  />

                  <div className="flex items-baseline justify-between gap-4 border-t border-line-strong pt-2.5">
                    <dt className="font-semibold text-ink-900">
                      Surplus held by the court
                    </dt>

                    <dd className="tnum text-lg font-semibold text-accent-700">
                      $43,690
                    </dd>
                  </div>
                </dl>

                <p className="mt-3 text-xs leading-relaxed text-ink-500">
                  Illustrative figures. Actual surplus depends on the sale,
                  recorded liens, and the rules of the jurisdiction. Junior
                  liens are often paid from the surplus before the former owner.
                </p>
              </div>
            </div>

            <div className="lg:pt-2">
              <h2 className="text-xl">
                Why the money often goes unclaimed
              </h2>

              <ul className="mt-5 space-y-5">
                <Reason title="Nobody is required to find you">
                  Agencies hold the funds and publish notices, but they are not
                  obliged to locate a former owner who has moved. Notices
                  frequently go to the address of the property that was sold.
                </Reason>

                <Reason title="The process is jurisdiction specific">
                  Rules differ by state, by county, and by the type of sale.
                  Some claims are administrative, some require a court petition,
                  and some require an attorney.
                </Reason>

                <Reason title="Deadlines expire quietly">
                  Claim windows range from months to years depending on the
                  jurisdiction. When one lapses, the funds usually escheat to
                  the state.
                </Reason>

                <Reason title="The owner has died">
                  When the owner of record has passed away, heirs may be
                  entitled, but many jurisdictions require an opened estate
                  first, which most families do not know how to start.
                </Reason>
              </ul>
            </div>
          </div>
        </Container>
      </Section>

      {/* ============================================================ PROCESS */}
      <Section
        tone="canvas"
        size="md"
      >
        <Container>
          <SectionIntro
            eyebrow="How it works"
            title="Verification first, then documents, then the claim"
            lede="Duequity begins with public-record research. A potential claimant is not asked to proceed until the record and responsible agency can be shown and independently verified."
          />

          <div className="mt-12 grid gap-x-12 gap-y-9 sm:grid-cols-2 lg:grid-cols-3">
            <Step
              number={1}
              title="We search public records"
            >
              Our staff reviews court dockets, sheriff and trustee sales, tax
              deed records and county filings across jurisdictions supported by
              Duequity&apos;s research systems.
            </Step>

            <Step
              number={2}
              title="You verify the record"
            >
              If we identify a potential claimant and make contact, we show the
              property, case or source reference, sale date and responsible
              agency so the record can be checked independently.
            </Step>

            <Step
              number={3}
              title="We confirm entitlement"
            >
              We check whether you are the former owner of record or an eligible
              heir, and which of the jurisdiction&apos;s rules apply to your
              claim.
            </Step>

            <Step
              number={4}
              title="We prepare the package"
            >
              We tell you exactly which documents the agency requires, help you
              obtain them, and assemble a complete claim rather than a partial
              one.
            </Step>

            <Step
              number={5}
              title="The claim is filed"
            >
              The filing route follows the requirements of the responsible
              jurisdiction. Where a court petition, claimant filing or attorney
              is required, the process follows that rule.
            </Step>

            <Step
              number={6}
              title="The agency pays you"
            >
              Payment goes through the route authorized by the jurisdiction,
              including directly to the claimant or estate where required.
              Duequity does not purchase surplus claims.
            </Step>
          </div>

          <div className="mt-10">
            <TextLink href="/how-it-works">
              Read the full process, stage by stage
            </TextLink>
          </div>
        </Container>
      </Section>

      {/* ============================================================== TRUST */}
      <Section
        tone="ink"
        size="md"
      >
        <Container>
          <div className="grid gap-12 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:gap-20">
            <SectionIntro
              eyebrow="Why you can check us"
              title="This industry has earned your suspicion"
              tone="light"
              lede="If a stranger tells you that money is waiting for you, the correct first reaction is doubt. Duequity is built so a potential claimant can verify the source and responsible agency before deciding whether to work with us."
            />

            <div className="grid gap-6 sm:grid-cols-2">
              <TrustPoint
                icon={
                  <IconSearch
                    size={18}
                  />
                }
                title="We show our sources"
              >
                Every record we present names the public source and responsible
                agency it came from. You can verify it independently.
              </TrustPoint>

              <TrustPoint
                icon={
                  <IconJurisdiction
                    size={18}
                  />
                }
                title="We tell you the free option"
              >
                Where a claimant may file directly without Duequity, we explain
                that option and identify the responsible agency before an
                agreement is signed.
              </TrustPoint>

              <TrustPoint
                icon={
                  <IconLock
                    size={18}
                  />
                }
                title="We ask for less"
              >
                Sensitive claimant information and documents are requested only
                when needed for a legitimate claim and secure onboarding.
              </TrustPoint>

              <TrustPoint
                icon={
                  <IconShield
                    size={18}
                  />
                }
                title="We follow the payment route"
              >
                Duequity follows the payment requirements of each approved
                jurisdiction and does not purchase or acquire claimant surplus
                rights.
              </TrustPoint>

              <TrustPoint
                icon={
                  <IconDocument
                    size={18}
                  />
                }
                title="Our fee is in writing first"
              >
                Any Duequity fee is disclosed in writing before an agreement is
                signed and is subject to the rules of the applicable
                jurisdiction.
              </TrustPoint>

              <TrustPoint
                icon={
                  <IconCheck
                    size={18}
                  />
                }
                title="We say no when it is right"
              >
                If Duequity cannot lawfully assist with a matter or the required
                facts have not been established, the matter does not proceed.
              </TrustPoint>
            </div>
          </div>

          <div className="mt-12 rounded-lg border border-ink-800 bg-ink-900/60 p-5 lg:mt-14">
            <p className="text-md font-semibold text-white">
              Duequity is not a government agency.
            </p>

            <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-ink-300">
              Duequity is a private company operated by Westforge Holdings Inc.
              We are not affiliated with any court, county, sheriff, trustee or
              state office, and we do not represent ourselves as one. We are
              also not a law firm and do not give legal advice.
            </p>
          </div>
        </Container>
      </Section>

      {/* =========================================================== COVERAGE */}
      <Section
        tone="paper"
        size="md"
      >
        <Container>
          <div className="flex flex-wrap items-end justify-between gap-6">
            <SectionIntro
              eyebrow="National geography, jurisdiction-specific rules"
              title="Where Duequity operates"
              lede="Duequity maintains nationwide state and county geography while operational eligibility remains jurisdiction specific. A county is not treated as cleared for claimant engagement merely because it appears in the directory."
            />

            <ButtonLink
              href="/states"
              trailing={
                <IconArrowRight
                  size={16}
                />
              }
            >
              View nationwide directory
            </ButtonLink>
          </div>

          {states.length === 0 ? (
            <div className="mt-10 rounded-lg border border-dashed border-line-strong bg-inset px-6 py-10 text-center">
              <p className="text-base font-semibold text-ink-800">
                Jurisdiction information is being reviewed
              </p>

              <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-ink-600">
                Duequity applies jurisdiction-specific rules before claimant
                engagement, filing or payment activity proceeds.
              </p>
            </div>
          ) : (
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {states.map(
                (state) => {
                  const open =
                    state.jurisdictions.filter(
                      (jurisdiction) =>
                        jurisdiction.coverage ===
                        "open",
                    ).length;

                  const attorneyRequired =
                    state.jurisdictions.filter(
                      (jurisdiction) =>
                        jurisdiction.coverage ===
                        "attorney_required",
                    ).length;

                  const pending =
                    state.jurisdictions.length -
                    open -
                    attorneyRequired;

                  return (
                    <Link
                      key={state.state}
                      href={`/states/${state.state.toLowerCase()}`}
                      className="group rounded-lg border border-line bg-paper p-4 shadow-xs transition-colors hover:border-ink-300 hover:bg-inset focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500"
                    >
                      <div className="flex items-baseline justify-between gap-3">
                        <h3 className="font-sans text-base font-semibold text-ink-900 group-hover:text-accent-700">
                          {state.stateName}
                        </h3>

                        <span className="font-mono text-xs text-ink-400">
                          {state.state}
                        </span>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {open > 0 && (
                          <Badge tone="positive">
                            {open} open{" "}
                            {open === 1
                              ? "area"
                              : "areas"}
                          </Badge>
                        )}

                        {attorneyRequired > 0 && (
                          <Badge tone="counsel">
                            {attorneyRequired} attorney required
                          </Badge>
                        )}

                        {pending > 0 && (
                          <Badge tone="neutral">
                            {pending} not open
                          </Badge>
                        )}
                      </div>
                    </Link>
                  );
                },
              )}
            </div>
          )}

          <p className="mt-6 text-sm text-ink-500">
            {formatCount(
              countyCount,
            )}{" "}
            county level{" "}
            {countyCount === 1
              ? "jurisdiction"
              : "jurisdictions"}{" "}
            recorded across{" "}
            {formatCount(
              states.length,
            )}{" "}
            {states.length === 1
              ? "state"
              : "states"}
            , of{" "}
            {formatCount(
              coverage.nation
                .countyEquivalents,
            )}{" "}
            nationally. Operational eligibility is determined separately from
            geographic directory coverage.
          </p>
        </Container>
      </Section>

      {/* ================================================================ CTA */}
      <Section
        tone="sunken"
        size="sm"
      >
        <Container
          width="narrow"
          className="text-center"
        >
          <h2 className="text-2xl sm:text-3xl">
            Duequity starts with the research
          </h2>

          <p className="mt-3 text-lg leading-relaxed text-ink-600">
            Our staff identifies potential surplus records from official public
            sources and researches the legitimate former owner, heir or other
            entitled party. If Duequity contacts you, we will explain the record,
            source, jurisdiction and next steps before you decide whether to
            proceed.
          </p>

          <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
            <ButtonLink
              href="/how-it-works"
              variant="primary"
              accent
              size="lg"
              trailing={
                <IconArrowRight
                  size={18}
                />
              }
            >
              Learn how Duequity works
            </ButtonLink>

            <ButtonLink
              href="/contact"
              size="lg"
            >
              Contact Duequity
            </ButtonLink>
          </div>

          <p className="mt-5 text-sm text-ink-500">
            Already working with us?{" "}
            <TextLink href="/claimant/sign-in">
              Sign in to My Duequity
            </TextLink>
          </p>
        </Container>
      </Section>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Local presentation pieces                                                   */
/* -------------------------------------------------------------------------- */

function Row({
  label,
  children,
  mono = false,
}: {
  label: string;
  children: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="shrink-0 text-xs text-ink-400">
        {label}
      </span>

      <span
        className={
          mono
            ? "text-right font-mono text-sm text-ink-100"
            : "text-right text-sm font-medium text-ink-100"
        }
      >
        {children}
      </span>
    </div>
  );
}

function Figure({
  label,
  value,
  negative = false,
}: {
  label: string;
  value: string;
  negative?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-ink-600">
        {negative && (
          <span
            aria-hidden="true"
            className="mr-1 text-ink-400"
          >
            less
          </span>
        )}

        {label}
      </dt>

      <dd className="tnum text-ink-800">
        {value}
      </dd>
    </div>
  );
}

function Reason({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="border-l-2 border-line-strong pl-4">
      <h3 className="font-sans text-base font-semibold text-ink-900">
        {title}
      </h3>

      <p className="mt-1 text-md leading-relaxed text-ink-600">
        {children}
      </p>
    </li>
  );
}

function TrustPoint({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <span
        aria-hidden="true"
        className="inline-flex size-9 items-center justify-center rounded-md border border-ink-700 bg-ink-900 text-accent-300"
      >
        {icon}
      </span>

      <h3 className="mt-3 font-sans text-base font-semibold text-white">
        {title}
      </h3>

      <p className="mt-1.5 text-sm leading-relaxed text-ink-300">
        {children}
      </p>
    </div>
  );
}