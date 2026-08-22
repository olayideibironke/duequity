import type { Metadata } from "next";
import { Container, Prose, Section } from "@/components/public/section";
import { Callout } from "@/components/ui/surface";
import { TextLink } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Terms",
  description:
    "Terms of use for the Duequity website and platform, operated by Westforge Holdings Inc.",
};

export default function TermsPage() {
  return (
    <>
      <Section tone="ink" size="sm">
        <Container>
          <p className="eyebrow text-accent-300">Legal</p>
          <h1 className="mt-3 text-3xl text-white sm:text-4xl">Terms of use</h1>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-ink-300">
            These terms govern use of the Duequity website and platform. They
            are separate from any service agreement for a specific claim.
          </p>
        </Container>
      </Section>

      <Section tone="paper" size="md">
        <Container width="reading">
          <Callout tone="caution" title="Draft pending legal review">
            <p>
              This page sets out the intended terms of use for the Duequity
              platform. It has not yet been reviewed by counsel and is not a
              final agreement. Reviewed terms will be published before Duequity
              operates with real claimants.
            </p>
          </Callout>

          <Prose className="mt-10">
            <h2>Who we are</h2>
            <p>
              Duequity is a property surplus recovery and claims coordination
              service operated by Westforge Holdings Inc. References to
              Duequity, we, us and our mean Westforge Holdings Inc.
            </p>

            <h2>These terms are not a service agreement</h2>
            <p>
              Using this website does not create a client relationship, does not
              commit Duequity to pursue a claim, and does not commit you to
              anything. Work on a specific claim is governed by a separate
              written service agreement that sets out the fee, the jurisdiction
              rules that apply, and the required disclosures. Nothing on this
              website supersedes that agreement.
            </p>

            <h2>No legal advice</h2>
            <p>
              Duequity is not a law firm. Information on this website, including
              jurisdiction pages and process descriptions, is general
              information and is not legal advice. It may not reflect current
              law, and it does not account for your circumstances. Do not rely
              on it as a substitute for advice from a licensed attorney in your
              state. See <TextLink href="/disclosures">disclosures</TextLink>.
            </p>

            <h2>Accuracy of information</h2>
            <p>
              Duequity derives property and case information from public records
              and third party sources. Those sources contain errors, are updated
              on their own schedules, and may be incomplete. Where we present a
              figure we have calculated rather than one an agency has confirmed,
              we label it as an estimate. An estimate is not a statement that
              funds exist, that they are available, or that you are entitled to
              them.
            </p>
            <p>
              Duequity does not warrant that information on this website is
              accurate, current, or complete, and does not warrant that a search
              will identify every record that may concern you.
            </p>

            <h2>Acceptable use</h2>
            <p>You agree not to:</p>
            <ul>
              <li>
                Use the platform to search for or contact people for any purpose
                other than a legitimate surplus claim inquiry
              </li>
              <li>
                Attempt to access records, accounts or documents belonging to
                anyone else
              </li>
              <li>
                Scrape, harvest or systematically extract data from the platform
              </li>
              <li>
                Probe, scan or test the security of the platform without our
                written permission
              </li>
              <li>
                Impersonate another person or misrepresent your entitlement
              </li>
              <li>Submit false, forged or altered documents</li>
            </ul>
            <p>
              Submitting a fraudulent claim to a court or government agency is a
              serious offence. Where we identify a suspected fraudulent claim we
              will decline it and may report it.
            </p>

            <h2>Claimant accounts</h2>
            <p>
              Where you hold a My Duequity account, you are responsible for
              keeping your credentials confidential and for notifying us
              promptly if you believe your account has been accessed by someone
              else. We may suspend an account where we reasonably suspect
              unauthorised access or fraudulent activity.
            </p>

            <h2>Third parties and attorneys</h2>
            <p>
              Where Duequity refers you to an independent attorney, that
              engagement is between you and the attorney or firm. Duequity is
              not a party to it, does not supervise the attorney&apos;s work,
              does not share in their fees, and is not responsible for the
              services they provide. Links to external websites, including
              agency websites, are provided for convenience and are not an
              endorsement.
            </p>

            <h2>Limitation of liability</h2>
            <p>
              To the fullest extent permitted by law, Duequity is not liable for
              indirect, incidental, special, consequential or punitive damages
              arising from use of this website, including any claim that a
              deadline was missed, a record was inaccurate, or a claim was not
              identified. This limitation does not apply where the law does not
              permit it.
            </p>

            <h2>Changes</h2>
            <p>
              We may update these terms. Where a change is material we will note
              it on this page. Continuing to use the platform after a change
              means you accept the updated terms.
            </p>

            <h2>Governing law</h2>
            <p>
              These terms are governed by the laws of the state in which
              Westforge Holdings Inc. is organised, without regard to conflict
              of laws principles. The governing state and dispute resolution
              provisions will be specified in the reviewed version of these
              terms.
            </p>

            <h2>Contact</h2>
            <p>
              Questions about these terms may be sent to{" "}
              <span className="font-mono text-sm">legal@duequity.com</span>.
            </p>
          </Prose>
        </Container>
      </Section>
    </>
  );
}
