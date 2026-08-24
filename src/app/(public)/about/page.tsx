import type { Metadata } from "next";
import { Container, Prose, Section } from "@/components/public/section";
import { Card, CardBody, Callout } from "@/components/ui/surface";
import { ButtonLink, TextLink } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "About",
  description:
    "Duequity is a national property surplus recovery and claims coordination platform operated by Westforge Holdings Inc.",
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
            Duequity is a national property surplus recovery and claims
            coordination platform operated by Westforge Holdings Inc.
          </p>
        </Container>
      </Section>

      <Section tone="paper" size="md">
        <Container width="reading">
          <Prose>
            <h2>What Duequity does</h2>
            <p>
              When a property is sold at a foreclosure or tax sale for more than
              the debt secured against it, the excess is called a surplus. That
              money generally belongs to the former owner, or if they have died,
              to their heirs. It sits with a court, county, sheriff, trustee or
              state office until someone claims it, and if nobody does, most
              states eventually take it.
            </p>
            <p>
              Duequity identifies those funds, locates the people entitled to
              them, helps verify entitlement, coordinates the documentation the
              responsible agency requires, tracks the claim through to payment,
              and routes legally complicated matters to independent attorneys.
            </p>

            <h2>Why the work is difficult</h2>
            <p>
              There is no national surplus system. Rules are set state by state
              and often county by county, and they turn on details: whether the
              foreclosure was judicial or nonjudicial, whether a sheriff or a
              trustee conducted the sale, whether the surplus is held by a court
              or a treasurer, whether the claim is administrative or requires a
              petition, whether an attorney must file it, what a recovery
              service may charge, and how long the window stays open.
            </p>
            <p>
              Add a deceased owner, several heirs, a dissolved company, a
              bankruptcy or a junior lien, and a claim that looked like
              paperwork becomes a legal matter. Most of Duequity is built to
              handle that variation systematically, rather than relying on
              anyone remembering the rules of three thousand counties.
            </p>

            <h2>What we are not</h2>
            <p>
              This industry contains a great deal of predatory behaviour, so it
              is worth being direct about the boundaries we operate within.
            </p>
            <ul>
              <li>
                <strong>We are not a government agency.</strong> Duequity is a
                private company and is not affiliated with any court, county or
                state office.
              </li>
              <li>
                <strong>We are not a law firm.</strong> We do not provide legal
                advice or representation. Where counsel is required, you engage
                an independent attorney directly and we take no share of their
                fee.
              </li>
              <li>
                <strong>We do not buy claims.</strong> We do not purchase
                surplus claims or take assignments of your rights at a discount.
              </li>
              <li>
                <strong>We do not hold your money.</strong> The agency pays you,
                the estate, or an attorney trust account. We are never a payee.
              </li>
              <li>
                <strong>
                  We are not a foreclosure rescue or debt relief service.
                </strong>{" "}
                We do not stop foreclosures, modify mortgages or negotiate
                debts. Our work begins after a sale has already happened.
              </li>
            </ul>

            <h2>How we think about trust</h2>
            <p>
              Anyone who receives an unsolicited message saying that money is
              waiting for them should assume it is a scam. That is the correct
              instinct, and it is the central design problem of this business.
            </p>
            <p>
              Our answer is to put the proof first. Before we ask for anything
              sensitive, we show you the public case record, the agency that
              holds the funds, and that agency&apos;s own contact details, so
              you can verify the claim independently or pursue it yourself
              without us. We publish the free option rather than hiding it, and
              we tell people plainly when we cannot lawfully help them.
            </p>
            <p>
              We would rather compete on research quality, jurisdiction
              expertise and handling difficult heir cases than on being the
              first to reach someone with a persuasive letter.
            </p>

            <h2>Westforge Holdings Inc.</h2>
            <p>
              Duequity is built and operated by Westforge Holdings Inc. Duequity
              is presented as <strong>Duequity by Westforge</strong> in partner
              and institutional contexts.
            </p>
          </Prose>

          <Callout
            tone="neutral"
            className="mt-10"
            title="Where Duequity currently stands"
          >
            <p>
              Duequity has not yet activated a jurisdiction, has not accepted a
              claimant, and has not completed a recovery. Nothing on this site
              presents an invented case as though it were one of ours. Coverage,
              fee rules and deadlines are shown only where they come from a
              recorded jurisdiction rule, and where a figure is not recorded
              these pages say so. See{" "}
              <TextLink href="/disclosures">disclosures</TextLink> for the full
              statement and <TextLink href="/states">where we operate</TextLink>{" "}
              for current coverage.
            </p>
          </Callout>

          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            <Card>
              <CardBody>
                <h2 className="font-sans text-base font-semibold text-ink-900">
                  How Duequity works
                </h2>
                <p className="mt-1.5 text-sm text-ink-600">
                  Learn how we identify records, verify claimants and coordinate
                  eligible surplus claims.
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
                  Contact Duequity if you have a question about our company or
                  services.
                </p>
                <ButtonLink href="/contact" className="mt-4">
                  Contact Duequity
                </ButtonLink>
              </CardBody>
            </Card>
          </div>
        </Container>
      </Section>
    </>
  );
}