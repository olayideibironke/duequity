import type { Metadata } from "next";
import { ButtonLink, TextLink } from "@/components/ui/button";
import {
  Container,
  Prose,
  Section,
  SectionIntro,
} from "@/components/public/section";
import { Callout, Card, CardBody, CardHeader } from "@/components/ui/surface";
import { Badge } from "@/components/ui/badge";
import { IconArrowRight } from "@/components/ui/icon";
import { RECOVERY_STAGES } from "@/domain/recovery-stages";

export const metadata: Metadata = {
  title: "How it works",
  description:
    "The Duequity recovery process, stage by stage: how surplus funds are identified, how entitlement is verified, what documents agencies require, and how payment reaches a claimant.",
};

/**
 * HOW IT WORKS
 *
 * The claimant facing explanation of the operating model. Reads the configured
 * recovery stages from the same source the portal timeline uses, so the promise on
 * the public site and the experience inside the product cannot diverge.
 */
export default function HowItWorksPage() {
  return (
    <>
      <Section tone="ink" size="sm">
        <Container>
          <p className="eyebrow text-accent-300">The process</p>
          <h1 className="mt-3 max-w-3xl text-3xl text-white sm:text-4xl">
            What happens between a public record and money in your hands
          </h1>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-ink-300">
            Surplus recovery is administrative work, not a lottery. Most of it
            is research, document collection, and following a specific
            agency&apos;s specific procedure. Here is the whole sequence.
          </p>
        </Container>
      </Section>

      {/* ===================================================== THE TWELVE STAGES */}
      <Section tone="paper" size="md">
        <Container>
          <SectionIntro
            eyebrow="Recovery stages"
            title="Twelve stages, tracked individually"
            lede="Your portal shows exactly which stage your claim is in, what has been completed, and the one thing needed next. Stages vary by jurisdiction, and some do not apply to every claim."
          />

          <ol className="mt-10 grid gap-x-10 gap-y-6 sm:grid-cols-2">
            {RECOVERY_STAGES.map((stage) => (
              <li key={stage.key} className="flex gap-4">
                <span
                  aria-hidden="true"
                  className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border border-line-strong bg-inset font-mono text-xs font-semibold text-ink-600"
                >
                  {stage.ordinal}
                </span>
                <div className="min-w-0">
                  <h3 className="font-sans text-base font-semibold text-ink-900">
                    {stage.claimantLabel}
                  </h3>
                  <p className="mt-1 text-md leading-relaxed text-ink-600">
                    {stage.claimantDescription}
                  </p>
                </div>
              </li>
            ))}
          </ol>

          <Callout tone="neutral" className="mt-10">
            <p>
              <span className="font-semibold text-ink-900">
                Timing is largely controlled by the agency, not by Duequity.
              </span>{" "}
              Once a claim is filed, the review period is set by the court or
              county holding the funds. It commonly runs from several weeks to
              several months, and it can be longer where a probate or court
              petition is involved. We will not give you a date we cannot
              control, but we will tell you what the agency told us.
            </p>
          </Callout>
        </Container>
      </Section>

      {/* ============================================================= DOCUMENTS */}
      <Section tone="canvas" size="md">
        <Container>
          <div className="grid gap-12 lg:grid-cols-2 lg:gap-16">
            <div>
              <SectionIntro
                eyebrow="Documents"
                title="What agencies typically ask for"
                lede="The exact list depends on your jurisdiction and your circumstances. We tell you the specific list for your claim rather than a generic one."
              />

              <div className="mt-8 space-y-6">
                <DocGroup
                  title="If you are the former owner"
                  items={[
                    "Government issued photo identification",
                    "Proof that you owned the property, often the recorded deed",
                    "A signed affidavit of entitlement, usually notarised",
                    "The agency's own claim form, where it has one",
                    "Form W-9, where the agency issues a tax reportable payment",
                  ]}
                />
                <DocGroup
                  title="If the owner has died"
                  items={[
                    "A certified copy of the death certificate, not an informational copy",
                    "Letters of administration or testamentary from the probate court",
                    "An affidavit of heirship identifying all heirs at law",
                    "Identification for each heir making a claim",
                    "A will or trust instrument, where one exists",
                  ]}
                />
                <DocGroup
                  title="If the owner was a business or trust"
                  items={[
                    "Articles of organization or incorporation",
                    "A certificate of good standing or evidence of reinstatement",
                    "Documentation of authority to act for the entity",
                    "The trust instrument and evidence of trustee authority",
                  ]}
                />
              </div>
            </div>

            <div className="lg:pt-2">
              <Card>
                <CardHeader
                  title="Why documents get rejected"
                  description="Most delays are avoidable. These are the ones we see most often."
                />
                <CardBody className="space-y-4">
                  <Rejection reason="An informational death certificate instead of a certified copy">
                    A certified copy has a raised seal you can feel. Courts will
                    not accept the informational version.
                  </Rejection>
                  <Rejection reason="A photograph with a corner cut off">
                    Identification documents must show all four edges.
                    Photograph it flat, in good light, on a dark surface.
                  </Rejection>
                  <Rejection reason="A name that does not match the deed">
                    If your name changed through marriage, divorce or a legal
                    change, the agency will want the document that bridges the
                    two names.
                  </Rejection>
                  <Rejection reason="An expired certificate of good standing">
                    Entity documents often have a validity window measured in
                    weeks.
                  </Rejection>
                  <Rejection reason="A claim signed by one heir when the jurisdiction requires all of them">
                    Some agencies will not disburse a partial share. This is a
                    common reason a family claim stalls.
                  </Rejection>
                </CardBody>
              </Card>

              <Callout tone="positive" className="mt-6">
                <p>
                  We check every document against the requirements of your
                  specific agency before the claim is filed. A complete package
                  is the single biggest factor in how quickly a claim moves.
                </p>
              </Callout>
            </div>
          </div>
        </Container>
      </Section>

      {/* =============================================================== PAYMENT */}
      <Section tone="paper" size="md">
        <Container>
          <SectionIntro
            eyebrow="Payment"
            title="How the money actually reaches you"
            lede="This is the part of the industry where the most harm has been done, so it is the part we are most explicit about."
          />

          <div className="mt-10 grid gap-6 lg:grid-cols-3">
            <Card>
              <CardBody>
                <Badge tone="positive" size="md">
                  What happens
                </Badge>
                <h3 className="mt-3 font-sans text-base font-semibold text-ink-900">
                  The agency pays you directly
                </h3>
                <p className="mt-2 text-md leading-relaxed text-ink-600">
                  The court, county, sheriff or trustee issues payment in your
                  name, to the estate, or to an attorney trust account where
                  counsel is involved. It goes to the address or account on the
                  claim.
                </p>
              </CardBody>
            </Card>

            <Card>
              <CardBody>
                <Badge tone="critical" size="md">
                  What never happens
                </Badge>
                <h3 className="mt-3 font-sans text-base font-semibold text-ink-900">
                  Duequity does not handle your funds
                </h3>
                <p className="mt-2 text-md leading-relaxed text-ink-600">
                  We do not receive your payment, deposit it, endorse it, or
                  hold it in an account of ours. We do not buy surplus claims
                  and we do not take assignments of your rights.
                </p>
              </CardBody>
            </Card>

            <Card>
              <CardBody>
                <Badge tone="neutral" size="md">
                  Then separately
                </Badge>
                <h3 className="mt-3 font-sans text-base font-semibold text-ink-900">
                  We invoice our disclosed fee
                </h3>
                <p className="mt-2 text-md leading-relaxed text-ink-600">
                  After you are paid, we invoice the service fee set out in your
                  agreement. It is capped by the rules of your jurisdiction. If
                  nothing is recovered, there is no fee.
                </p>
              </CardBody>
            </Card>
          </div>

          <div className="mt-8">
            <TextLink href="/fees">See how fees are set and capped</TextLink>
          </div>
        </Container>
      </Section>

      {/* ============================================================= ATTORNEYS */}
      <Section tone="canvas" size="md">
        <Container>
          <SectionIntro
            eyebrow="Administrative work and legal work"
            title="Duequity is not a law firm, and the line matters"
            lede="Most surplus claims are administrative: research, documents, and following an agency's procedure. Some cross into legal work. We handle the first, and independent attorneys handle the second."
          />

          {/* The three lanes, explained publicly in the same terms the product uses
              internally, so what a claimant is told matches how the claim is handled. */}
          <div className="mt-10 grid gap-5 lg:grid-cols-3">
            <Card>
              <CardBody>
                <Badge tone="positive" size="md">
                  Administrative
                </Badge>
                <h3 className="mt-3 font-sans text-base font-semibold text-ink-900">
                  Duequity handles it
                </h3>
                <p className="mt-2 text-md leading-relaxed text-ink-600">
                  A clear former owner, no dispute, documents obtainable, and a
                  jurisdiction that permits administrative assistance. We do the
                  research, help you gather what the agency needs, file the
                  claim, and track it through to payment.
                </p>
              </CardBody>
            </Card>

            <Card>
              <CardBody>
                <Badge tone="caution" size="md">
                  Additional review
                </Badge>
                <h3 className="mt-3 font-sans text-base font-semibold text-ink-900">
                  We look before we act
                </h3>
                <p className="mt-2 text-md leading-relaxed text-ink-600">
                  Something has been identified that may need legal input: a
                  question about how ownership was held, a possible other
                  interested party, or a jurisdiction with unsettled rules. A
                  review is not bad news. It means we are checking rather than
                  assuming.
                </p>
              </CardBody>
            </Card>

            <Card>
              <CardBody>
                <Badge tone="counsel" size="md">
                  Attorney required
                </Badge>
                <h3 className="mt-3 font-sans text-base font-semibold text-ink-900">
                  A licensed attorney does the legal work
                </h3>
                <p className="mt-2 text-md leading-relaxed text-ink-600">
                  Some steps may only be taken by an attorney: filing with a
                  court, opening an estate, or resolving a dispute. You engage
                  one directly, and Duequity keeps coordinating everything else
                  on your claim.
                </p>
              </CardBody>
            </Card>
          </div>

          <div className="mt-12 grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-16">
            <div>
              <h3 className="text-xl">
                What moves a claim into legal territory
              </h3>
              <Prose className="mt-4">
                <ul>
                  <li>The jurisdiction requires a petition to a court</li>
                  <li>An estate must be opened before heirs can be paid</li>
                  <li>Two or more people claim the same funds</li>
                  <li>
                    A bankruptcy, tax lien or judgment affects entitlement
                  </li>
                  <li>The owner of record was a dissolved company</li>
                  <li>Title or prior ownership is contested</li>
                  <li>
                    Proceeding requires interpreting a statute, a deed, or a
                    court order
                  </li>
                </ul>
                <p>
                  We check for these at the outset rather than discovering them
                  later, and we tell you which of the three lanes your claim is
                  in and why.
                </p>
                <p>
                  <strong>Duequity stays on your claim either way.</strong> A
                  referral does not mean we hand you over and step back. We
                  continue the research, document coordination, agency
                  communication, and deadline tracking. The attorney does the
                  legal work.
                </p>
              </Prose>
            </div>

            <div className="lg:pt-2">
              <Callout tone="counsel" title="How we handle referrals">
                <div className="space-y-3">
                  <p>
                    We maintain a network of independent attorneys licensed in
                    the states where we operate, chosen for experience in
                    probate, contested surplus and complex title matters.
                  </p>
                  <p>
                    <span className="font-semibold text-ink-900">
                      Duequity does not share in attorney fees
                    </span>{" "}
                    and receives no referral payment, finder&apos;s fee, or
                    other compensation from any attorney or firm. There is no
                    financial incentive for us to route you to counsel, which is
                    the point.
                  </p>
                  <p>
                    You are free to use your own attorney. Where counsel is
                    involved you will receive two separate bills: our service
                    fee, and the firm&apos;s own fee under your agreement with
                    them. We never combine the two and we take no part of
                    theirs.
                  </p>
                </div>
              </Callout>

              <Callout
                tone="neutral"
                className="mt-5"
                title="What our specialists will not do"
              >
                <p>
                  Our specialists research records, obtain documents, coordinate
                  with agencies, and keep you informed. They will not advise you
                  on the legal merits of your position, interpret a document for
                  you, or tell you what a court is likely to decide. If you need
                  that, you need a lawyer, and we will say so plainly rather
                  than guess.
                </p>
              </Callout>
            </div>
          </div>
        </Container>
      </Section>

      {/* =================================================================== CTA */}
      <Section tone="sunken" size="sm">
        <Container width="narrow" className="text-center">
          <h2 className="text-2xl">See whether a record exists</h2>
          <p className="mt-3 text-lg leading-relaxed text-ink-600">
            A search costs nothing and asks for no personal information.
          </p>
          <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
            <ButtonLink
              href="/check"
              variant="primary"
              accent
              size="lg"
              trailing={<IconArrowRight size={18} />}
            >
              Check a property
            </ButtonLink>
            <ButtonLink href="/states" size="lg">
              Where we operate
            </ButtonLink>
          </div>
        </Container>
      </Section>
    </>
  );
}

function DocGroup({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h3 className="font-sans text-base font-semibold text-ink-900">
        {title}
      </h3>
      <ul className="mt-2.5 space-y-1.5">
        {items.map((item) => (
          <li key={item} className="flex gap-2.5 text-md text-ink-600">
            <span
              aria-hidden="true"
              className="mt-2 size-1 shrink-0 rounded-full bg-ink-300"
            />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Rejection({
  reason,
  children,
}: {
  reason: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-l-2 border-caution-200 pl-3.5">
      <p className="text-sm font-semibold text-ink-900">{reason}</p>
      <p className="mt-0.5 text-sm text-ink-600">{children}</p>
    </div>
  );
}
