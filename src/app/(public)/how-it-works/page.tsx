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
    "The DueQuity recovery process, stage by stage: how surplus funds are identified, how claimant eligibility is reviewed, what documents agencies require, and how recovery funds are paid.",
};

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
                Timing is largely controlled by the agency, not by DueQuity.
              </span>{" "}
              Once a claim is filed, the review period is set by the agency,
              court, county, trustee, or other authority handling the recovery.
              It commonly runs from several weeks to several months and can be
              longer where probate, court proceedings, competing claims, or
              additional documentation are involved. We will not give you a
              date we cannot control, but we will tell you what the responsible
              authority tells us.
            </p>
          </Callout>
        </Container>
      </Section>

      <Section tone="canvas" size="md">
        <Container>
          <div className="grid gap-12 lg:grid-cols-2 lg:gap-16">
            <div>
              <SectionIntro
                eyebrow="Documents"
                title="What agencies typically ask for"
                lede="The exact list depends on your jurisdiction and your circumstances. We tell you the specific list for your claim rather than relying on a generic checklist."
              />

              <div className="mt-8 space-y-6">
                <DocGroup
                  title="If you are the former owner"
                  items={[
                    "Government-issued photo identification",
                    "Evidence connecting you to the former ownership record, where required",
                    "A signed affidavit or declaration of entitlement, where required",
                    "The agency's own claim form, where one exists",
                    "Form W-9, where required for payment or tax reporting",
                  ]}
                />

                <DocGroup
                  title="If the owner has died"
                  items={[
                    "A certified copy of the death certificate, where required",
                    "Letters of administration or testamentary, where an estate has been opened",
                    "An affidavit of heirship or similar heirship documentation, where permitted",
                    "Identification for the person or persons making the claim",
                    "A will, trust instrument, or other estate document, where applicable",
                  ]}
                />

                <DocGroup
                  title="If the owner was a business or trust"
                  items={[
                    "Articles of organization or incorporation",
                    "A certificate of good standing, reinstatement, or comparable status evidence where required",
                    "Documentation showing authority to act for the entity",
                    "The trust instrument and evidence of trustee authority, where applicable",
                  ]}
                />
              </div>
            </div>

            <div className="lg:pt-2">
              <Card>
                <CardHeader
                  title="Why documents get rejected"
                  description="Many delays are avoidable. These are common issues we check for before submission."
                />

                <CardBody className="space-y-4">
                  <Rejection reason="An informational death certificate instead of an acceptable certified copy">
                    Many jurisdictions require an official certified death
                    certificate rather than an informational or unofficial
                    copy. We verify the form of certification required by the
                    agency or court handling the claim.
                  </Rejection>

                  <Rejection reason="A photograph or scan that cuts off part of the document">
                    Identification and supporting documents should normally show
                    all required information and all document edges clearly. We
                    check image quality before relying on an upload.
                  </Rejection>

                  <Rejection reason="A name that does not match the ownership record">
                    If your name changed through marriage, divorce, adoption, or
                    another legal process, the agency may require documentation
                    connecting your current identity to the name in the record.
                  </Rejection>

                  <Rejection reason="Entity documentation that is outdated or incomplete">
                    Some jurisdictions require current good-standing,
                    reinstatement, authority, or organizational records before
                    an entity-related claim can proceed.
                  </Rejection>

                  <Rejection reason="A claim submitted without every required claimant or representative">
                    Depending on the jurisdiction and ownership circumstances,
                    additional heirs, estate representatives, trustees, officers,
                    or other interested parties may need to participate before
                    payment can be approved.
                  </Rejection>
                </CardBody>
              </Card>

              <Callout tone="positive" className="mt-6">
                <p>
                  We check the recovery package against the requirements we have
                  established for the authority handling your specific claim
                  before submission. A complete and properly prepared package
                  can help avoid preventable delays.
                </p>
              </Callout>
            </div>
          </div>
        </Container>
      </Section>

      <Section tone="paper" size="md">
        <Container>
          <SectionIntro
            eyebrow="Payment"
            title="How recovery funds reach you"
            lede="Payment procedures vary by jurisdiction. DueQuity follows the payment route permitted by the agency, court, trustee, or other authority handling your recovery."
          />

          <div className="mt-10 grid gap-6 lg:grid-cols-3">
            <Card>
              <CardBody>
                <Badge tone="positive" size="md">
                  Jurisdiction controlled
                </Badge>

                <h3 className="mt-3 font-sans text-base font-semibold text-ink-900">
                  Payment follows the approved route
                </h3>

                <p className="mt-2 text-md leading-relaxed text-ink-600">
                  Depending on the rules that apply to your claim, recovery
                  funds may be paid directly to you, your estate, or authorized
                  counsel. In other jurisdictions, an authorized representative
                  payment route may be permitted. We confirm the approved route
                  for your specific matter before filing or coordinating
                  submission.
                </p>
              </CardBody>
            </Card>

            <Card>
              <CardBody>
                <Badge tone="neutral" size="md">
                  Where permitted
                </Badge>

                <h3 className="mt-3 font-sans text-base font-semibold text-ink-900">
                  DueQuity may receive payment on your behalf
                </h3>

                <p className="mt-2 text-md leading-relaxed text-ink-600">
                  Where applicable law, the approved jurisdiction process, and
                  your written authorization permit representative payment,
                  DueQuity may receive or process recovery funds through that
                  approved route. DueQuity does not purchase your claim or take
                  ownership of your surplus rights.
                </p>
              </CardBody>
            </Card>

            <Card>
              <CardBody>
                <Badge tone="positive" size="md">
                  Fully disclosed
                </Badge>

                <h3 className="mt-3 font-sans text-base font-semibold text-ink-900">
                  Fees follow the agreement and local rules
                </h3>

                <p className="mt-2 text-md leading-relaxed text-ink-600">
                  Your service agreement states the DueQuity fee, when it
                  becomes due, and how it is handled. Where you are paid
                  directly, the contractual fee may be handled separately.
                  Where an approved representative payment route permits fee
                  handling through disbursement, that process will be disclosed
                  before you authorize it.
                </p>
              </CardBody>
            </Card>
          </div>

          <Callout tone="neutral" className="mt-8">
            <p>
              <span className="font-semibold text-ink-900">
                DueQuity does not buy surplus claims or take assignments of
                ownership rights.
              </span>{" "}
              Our role is to provide recovery services and use only the filing,
              authorization, payment, and fee structure permitted for your
              jurisdiction and documented in your agreement.
            </p>
          </Callout>

          <div className="mt-8">
            <TextLink href="/fees">See how fees are set and capped</TextLink>
          </div>
        </Container>
      </Section>

      <Section tone="canvas" size="md">
        <Container>
          <SectionIntro
            eyebrow="Administrative work and legal work"
            title="DueQuity is not a law firm, and the line matters"
            lede="Many surplus recoveries can proceed through administrative processes. Others require legal work. DueQuity handles the recovery services it is permitted to perform, while licensed attorneys handle work that requires legal representation."
          />

          <div className="mt-10 grid gap-5 lg:grid-cols-3">
            <Card>
              <CardBody>
                <Badge tone="positive" size="md">
                  Administrative
                </Badge>

                <h3 className="mt-3 font-sans text-base font-semibold text-ink-900">
                  DueQuity handles the recovery work
                </h3>

                <p className="mt-2 text-md leading-relaxed text-ink-600">
                  Where the jurisdiction permits administrative recovery
                  assistance, we research the record, help gather required
                  documents, prepare the recovery package, and where permitted
                  file or coordinate its submission and track the matter through
                  the payment process.
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
                  Something may require additional review, such as uncertainty
                  about ownership, heirs, competing interests, entity status, or
                  the procedure required by a particular jurisdiction. We stop
                  and establish the proper route rather than assume.
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
                  Some recoveries may involve proceedings or legal issues that
                  require a licensed attorney, such as certain court filings,
                  estate proceedings, disputes, or title questions. You engage
                  counsel directly, while DueQuity can continue coordinating the
                  non-legal recovery work where appropriate.
                </p>
              </CardBody>
            </Card>
          </div>

          <div className="mt-12 grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-16">
            <div>
              <h3 className="text-xl">
                What can move a recovery into legal territory
              </h3>

              <Prose className="mt-4">
                <ul>
                  <li>
                    The applicable procedure requires a court filing or legal
                    representation
                  </li>
                  <li>
                    An estate must be opened or administered before recovery can
                    proceed
                  </li>
                  <li>
                    Two or more parties assert competing rights to the same
                    funds
                  </li>
                  <li>
                    A bankruptcy, tax lien, judgment, or other legal interest
                    affects the recovery
                  </li>
                  <li>
                    The owner of record was a dissolved or inactive entity
                  </li>
                  <li>Title or prior ownership is disputed or unclear</li>
                  <li>
                    Resolution requires legal advice, advocacy, or
                    interpretation that DueQuity cannot provide
                  </li>
                </ul>

                <p>
                  We screen for these issues as early as practical so the
                  recovery follows the proper administrative or legal route.
                </p>

                <p>
                  <strong>
                    DueQuity can remain involved in the non-legal recovery work.
                  </strong>{" "}
                  When counsel is required, we can continue coordinating
                  records, documents, agency information, and operational
                  tracking while the attorney performs the legal work.
                </p>
              </Prose>
            </div>

            <div className="lg:pt-2">
              <Callout tone="counsel" title="How attorney involvement works">
                <div className="space-y-3">
                  <p>
                    When legal work is required, DueQuity may coordinate with
                    independent attorneys licensed in the applicable
                    jurisdiction, or you may choose your own attorney.
                  </p>

                  <p>
                    <span className="font-semibold text-ink-900">
                      DueQuity does not share in attorney fees
                    </span>{" "}
                    and does not condition your recovery services on using a
                    particular attorney.
                  </p>

                  <p>
                    Any attorney-client relationship is separate from your
                    relationship with DueQuity. The attorney&apos;s services,
                    responsibilities, and fees are governed by your agreement
                    with that attorney or law firm.
                  </p>
                </div>
              </Callout>

              <Callout
                tone="neutral"
                className="mt-5"
                title="What our specialists will not do"
              >
                <p>
                  Our specialists research records, obtain and organize
                  documents, coordinate recovery processes, communicate
                  operational information, and keep you informed. They do not
                  provide legal advice, represent you as attorneys, or make
                  legal determinations that require a licensed lawyer.
                </p>
              </Callout>
            </div>
          </div>
        </Container>
      </Section>

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