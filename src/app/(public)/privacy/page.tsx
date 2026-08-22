import type { Metadata } from "next";
import { Container, Prose, Section } from "@/components/public/section";
import { Callout } from "@/components/ui/surface";
import { TextLink } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Privacy",
  description:
    "How Duequity collects, uses, retains and deletes personal information, and the rights available to claimants.",
};

export default function PrivacyPage() {
  return (
    <>
      <Section tone="ink" size="sm">
        <Container>
          <p className="eyebrow text-accent-300">Legal</p>
          <h1 className="mt-3 text-3xl text-white sm:text-4xl">Privacy</h1>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-ink-300">
            What Duequity collects, why, how long it is kept, and what you can
            ask us to do with it.
          </p>
        </Container>
      </Section>

      <Section tone="paper" size="md">
        <Container width="reading">
          <Callout tone="caution" title="Draft pending legal review">
            <p>
              This page states Duequity&apos;s intended privacy practices and
              the data handling the platform is built to support. It has not yet
              been reviewed by privacy counsel and is not a final privacy
              notice. A reviewed notice, including state specific rights under
              applicable privacy statutes, will be published before Duequity
              processes any real claimant information.
            </p>
          </Callout>

          <Prose className="mt-10">
            <h2>What we collect, and when</h2>
            <h3>When you search</h3>
            <p>
              A property search requires only an address, an owner name, or a
              county. We do not require an account, an email address, or any
              identifying information to search, and we do not ask for a Social
              Security number at any point in the search process.
            </p>

            <h3>When you choose to proceed</h3>
            <p>
              Once you decide to pursue a claim, we collect what the responsible
              agency requires to adjudicate it. That typically includes your
              legal name, contact details, mailing address, your relationship to
              the former owner, and copies of the documents the agency requires
              such as identification and proof of former ownership.
            </p>

            <h3>What we avoid collecting</h3>
            <ul>
              <li>
                <strong>Social Security numbers.</strong> Collected only where a
                specific jurisdiction requires one to issue payment. Where
                required, the number is handled by our identity verification
                provider and referenced in our records only by an opaque token.
              </li>
              <li>
                <strong>Bank account details.</strong> Agencies pay you
                directly, so we have no need to hold them and do not ask.
              </li>
              <li>
                <strong>Date of birth.</strong> Collected only where a
                jurisdiction requires it.
              </li>
            </ul>

            <h3>Information from public records</h3>
            <p>
              Much of what we hold about a property comes from public sources:
              court dockets, recorded deeds, tax rolls, sheriff and trustee sale
              results, and published county lists. We record where each fact
              came from and when it was last verified, so a claimant can see the
              basis for anything we assert.
            </p>

            <h2>How we use it</h2>
            <ul>
              <li>
                To determine whether a surplus may exist and who may be entitled
              </li>
              <li>To contact a prospective claimant about a specific record</li>
              <li>To verify identity and entitlement</li>
              <li>
                To prepare, file and track a claim with the responsible agency
              </li>
              <li>
                To coordinate with an attorney you have engaged, at your
                direction
              </li>
              <li>To meet our own legal, tax and record keeping obligations</li>
            </ul>
            <p>
              <strong>We do not sell personal information.</strong> We do not
              share it with data brokers, marketing partners, or lead buyers.
            </p>

            <h2>Who we share it with</h2>
            <ul>
              <li>
                <strong>The agency holding the funds,</strong> as part of your
                claim. This is the purpose of the engagement.
              </li>
              <li>
                <strong>An attorney you have engaged,</strong> and only at your
                direction.
              </li>
              <li>
                <strong>Service providers</strong> that operate our
                infrastructure, identity verification and correspondence, under
                contract and limited to what each requires.
              </li>
              <li>
                <strong>Where legally compelled,</strong> in response to a valid
                legal process.
              </li>
            </ul>

            <h2>Retention and deletion</h2>
            <p>
              Documents and claim records are retained while a claim is active
              and afterwards for the period applicable law and our record
              keeping obligations require. Beyond that, records are deleted on a
              schedule rather than kept indefinitely.
            </p>
            <p>
              You may ask us to delete information that is not subject to a
              retention obligation, and you may ask us to stop contacting you at
              any time. Where we cannot delete something because a legal
              obligation requires us to keep it, we will tell you what it is and
              why.
            </p>

            <h2>Your requests</h2>
            <p>
              You may ask us for a copy of the information we hold about you,
              ask us to correct it, ask us to delete it subject to the limits
              above, or withdraw consent to be contacted. Write to{" "}
              <span className="font-mono text-sm">privacy@duequity.com</span>.
              State specific rights under applicable privacy statutes will be
              set out in the reviewed notice.
            </p>

            <h2>Security</h2>
            <p>
              How documents are encrypted, who may access them, and what we log
              is set out on the{" "}
              <TextLink href="/security">security page</TextLink>.
            </p>

            <h2>Children</h2>
            <p>
              Duequity services are directed to adults. We do not knowingly
              collect information from children. Where a minor is an heir, we
              work through their legal guardian or the personal representative
              of the estate.
            </p>
          </Prose>
        </Container>
      </Section>
    </>
  );
}
