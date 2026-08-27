import type { Metadata } from "next";
import { Container, Prose, Section } from "@/components/public/section";
import { Card, CardBody, Callout } from "@/components/ui/surface";
import { ButtonLink, TextLink } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "About",
  description:
    "DueQuity is a national property surplus recovery and claims coordination platform operated by Westforge Holdings Inc.",
};

export default function AboutPage() {
  return (
    <>
      <Section tone="ink" size="sm">
        <Container>
          <p className="eyebrow text-accent-300">About</p>

          <h1 className="mt-3 max-w-3xl text-3xl text-white sm:text-4xl">
            Recover what is rightfully yours
          </h1>

          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-ink-300">
            DueQuity is a national property surplus recovery and claims
            coordination platform operated by Westforge Holdings Inc.
          </p>
        </Container>
      </Section>

      <Section tone="paper" size="md">
        <Container width="reading">
          <Prose>
            <h2>What DueQuity does</h2>

            <p>
              When a property is sold through a foreclosure, tax sale, or
              similar process for more than the amounts that must be satisfied
              from the sale, surplus funds may remain. Depending on the
              circumstances and applicable law, those funds may belong to a
              former owner, an estate, an heir, or another legally entitled
              party.
            </p>

            <p>
              DueQuity identifies public records that may reflect recoverable
              surplus funds, locates potential claimants, coordinates identity
              and eligibility review, helps gather required documentation,
              prepares recovery packages, and follows the jurisdiction-specific
              process through review and payment.
            </p>

            <p>
              Where a matter requires legal work, DueQuity does not perform that
              legal work. A licensed attorney handles the legal portion while
              DueQuity may continue coordinating the non-legal recovery work
              where appropriate.
            </p>

            <h2>Why the work is difficult</h2>

            <p>
              There is no single national surplus recovery system. Rules and
              procedures vary by state, county, court, agency, trustee, type of
              sale, and claimant circumstances.
            </p>

            <p>
              A recovery may depend on whether a sale was judicial or
              nonjudicial, who conducted the sale, which authority holds the
              funds, whether the claimant may file directly, whether an
              authorized representative may file or receive payment, whether an
              attorney is required, what documents are necessary, what a
              recovery service may charge, and how long the claim remains
              available.
            </p>

            <p>
              Add a deceased owner, multiple heirs, a dissolved company,
              bankruptcy, liens, title questions, or competing claims, and a
              matter that first appears administrative may require additional
              review or legal involvement.
            </p>

            <p>
              DueQuity is designed to manage that variation systematically by
              applying the recovery route established for each jurisdiction
              rather than assuming one process works everywhere.
            </p>

            <h2>What we are not</h2>

            <p>
              Surplus recovery requires trust, so we are direct about the
              boundaries of our role.
            </p>

            <ul>
              <li>
                <strong>We are not a government agency.</strong> DueQuity is a
                private company operated by Westforge Holdings Inc. and is not
                affiliated with or endorsed by any court, county, state office,
                tax authority, sheriff, trustee, or other government entity.
              </li>

              <li>
                <strong>We are not a law firm.</strong> We do not provide legal
                advice or represent claimants as attorneys. Where legal work is
                required, you may engage independent licensed counsel.
              </li>

              <li>
                <strong>We do not buy claims.</strong> We do not purchase
                surplus claims, take assignments of surplus ownership rights, or
                acquire an ownership interest in your recovery.
              </li>

              <li>
                <strong>We do not impose one payment route everywhere.</strong>{" "}
                Payment procedures vary by jurisdiction. Funds may be paid
                directly to you, an estate, authorized counsel, or through an
                authorized representative payment process where permitted.
                DueQuity follows the payment route established for the
                applicable jurisdiction and disclosed in your agreement.
              </li>

              <li>
                <strong>
                  We are not a foreclosure rescue or debt relief service.
                </strong>{" "}
                We do not stop foreclosures, modify mortgages, negotiate debts,
                repair credit, or provide debt relief. Our surplus recovery work
                concerns funds that may remain after a property sale has already
                occurred.
              </li>
            </ul>

            <h2>How we think about trust</h2>

            <p>
              Anyone receiving an unexpected message saying money may be waiting
              for them should verify the information before sharing sensitive
              documents or signing an agreement.
            </p>

            <p>
              DueQuity&apos;s approach is to put verifiable information first.
              We identify the underlying public record and the responsible
              authority so a prospective claimant can independently confirm the
              source of the recovery opportunity.
            </p>

            <p>
              We also make clear that, depending on the jurisdiction and
              eligibility requirements, a claimant may be able to pursue surplus
              funds directly without using a recovery service.
            </p>

            <p>
              We would rather compete on research quality, jurisdiction
              intelligence, claimant support, operational discipline, and the
              ability to coordinate difficult recoveries than on pressure or
              obscurity.
            </p>

            <h2>Westforge Holdings Inc.</h2>

            <p>
              DueQuity is built and operated by Westforge Holdings Inc. DueQuity
              is presented as <strong>DueQuity by Westforge</strong> in partner
              and institutional contexts.
            </p>
          </Prose>

          <Callout
            tone="neutral"
            className="mt-10"
            title="Jurisdiction-specific recovery"
          >
            <p>
              DueQuity does not assume that one filing, payment, fee, or
              representation structure applies nationwide. Each recovery is
              handled according to the operating route established for the
              applicable jurisdiction. Where a material requirement has not been
              established with sufficient confidence, the matter remains under
              review rather than being treated as authorized to proceed. See{" "}
              <TextLink href="/disclosures">disclosures</TextLink> for the full
              statement and <TextLink href="/states">where we operate</TextLink>{" "}
              for jurisdiction information.
            </p>
          </Callout>

          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            <Card>
              <CardBody>
                <h2 className="font-sans text-base font-semibold text-ink-900">
                  How DueQuity works
                </h2>

                <p className="mt-1.5 text-sm text-ink-600">
                  Learn how we identify records, review claimant eligibility,
                  coordinate documents, and follow the permitted recovery route.
                </p>

                <ButtonLink
                  href="/how-it-works"
                  variant="primary"
                  accent
                  className="mt-4"
                >
                  View the process
                </ButtonLink>
              </CardBody>
            </Card>

            <Card>
              <CardBody>
                <h2 className="font-sans text-base font-semibold text-ink-900">
                  Speak to someone
                </h2>

                <p className="mt-1.5 text-sm text-ink-600">
                  Contact DueQuity if you have a question about our company,
                  services, or recovery process.
                </p>

                <ButtonLink href="/contact" className="mt-4">
                  Contact DueQuity
                </ButtonLink>
              </CardBody>
            </Card>
          </div>
        </Container>
      </Section>
    </>
  );
}