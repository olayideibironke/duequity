import type { Metadata } from "next";
import { Container, Prose, Section } from "@/components/public/section";
import { Callout } from "@/components/ui/surface";
import { TextLink } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Disclosures",
  description:
    "Required Duequity disclosures: not a government agency, not a law firm, the free claim option, fee structure, no fund custody, and no guarantee of recovery.",
};

/**
 * DISCLOSURES
 *
 * The consolidated statement of every disclosure Duequity makes. Kept as a single
 * canonical page so the same wording appears in the service agreement, the intake
 * flow and the footer without drifting.
 */
export default function DisclosuresPage() {
  return (
    <>
      <Section tone="ink" size="sm">
        <Container>
          <p className="eyebrow text-accent-300">Legal</p>
          <h1 className="mt-3 text-3xl text-white sm:text-4xl">Disclosures</h1>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-ink-300">
            These statements apply to every Duequity engagement in every
            jurisdiction. You will receive them again in writing, individually
            acknowledged, before any agreement is signed.
          </p>
        </Container>
      </Section>

      <Section tone="paper" size="md">
        <Container width="reading">
          <Prose>
            <h2>Duequity is not a government agency</h2>
            <p>
              Duequity is a private company operated by Westforge Holdings Inc.
              Duequity is not a government agency, is not affiliated with any
              government agency, and does not act on behalf of any court,
              county, sheriff, trustee, or state office. Duequity does not
              represent itself as a government agency in any communication.
            </p>

            <h2>You may be able to claim funds yourself at no cost</h2>
            <p>
              In most jurisdictions a former property owner or an eligible heir
              may file a surplus claim directly with the agency holding the
              funds, without using a recovery service and without paying a
              service fee. Duequity will identify the responsible agency and
              provide its published contact information whether or not you
              choose to work with Duequity. See{" "}
              <TextLink href="/states">where we operate</TextLink> for agency
              details by jurisdiction.
            </p>

            <h2>Duequity is not a law firm</h2>
            <p>
              Duequity does not practise law, does not provide legal advice, and
              does not represent claimants in court. Nothing produced by
              Duequity is legal advice. Where a matter requires legal
              representation, Duequity may refer you to an independent attorney
              whom you engage directly under a separate engagement agreement
              with that attorney or firm.
            </p>
            <p>
              <strong>
                Duequity does not share in attorney fees and receives no
                referral fee, finder&apos;s fee, commission, or other
                compensation from any attorney or law firm.
              </strong>{" "}
              You are free to select your own attorney.
            </p>

            <h2>Duequity does not take custody of claimant funds</h2>
            <p>
              Payment of a surplus is issued by the responsible agency directly
              to the claimant, to the estate of a deceased owner, or to an
              attorney trust account where counsel is engaged. Duequity does not
              receive, hold, deposit, endorse, or disburse claimant funds, and
              is not a payee on an agency disbursement.
            </p>

            <h2>Duequity does not purchase claims</h2>
            <p>
              Duequity does not purchase surplus claims, does not take
              assignments of surplus rights, and does not acquire an ownership
              interest in a claimant&apos;s entitlement. Duequity acts as a
              service provider only. Several jurisdictions prohibit the
              assignment of a surplus claim, and Duequity does not do so in any
              jurisdiction regardless of local rules.
            </p>

            <h2>No guarantee of recovery</h2>
            <p>
              Duequity does not guarantee that a claim will be approved, that
              any amount will be recovered, or that recovery will occur within
              any particular period. Determinations are made by the agency or
              court holding the funds. A surplus may be reduced or eliminated by
              recorded liens, senior interests, statutory costs, or competing
              claims, and a claim deadline may already have expired.
            </p>

            <h2>Fees</h2>
            <p>
              Duequity charges a single service fee, disclosed in writing before
              any agreement is signed. The fee structure and any ceiling on it
              are determined by the rules of the jurisdiction in which the claim
              is made. Where a jurisdiction caps what a recovery service may
              charge, Duequity charges no more than that cap.
            </p>
            <p>
              There is no application fee, search fee, retainer, or recurring
              charge. If no amount is recovered, no service fee is charged.
              Duequity invoices its fee separately after the agency has paid the
              claimant, and does not deduct a fee from an agency disbursement.
              See <TextLink href="/fees">fees</TextLink> for a worked example.
            </p>

            <h2>Right to cancel</h2>
            <p>
              Where a jurisdiction provides a cancellation period, that period
              applies and is stated in your agreement. You may cancel within it
              at no cost. The applicable period for each recorded jurisdiction
              is published on that jurisdiction&apos;s page.
            </p>

            <h2>Not a foreclosure rescue or debt relief service</h2>
            <p>
              Duequity does not provide foreclosure rescue, loan modification,
              mortgage negotiation, credit repair, or debt relief services.
              Duequity does not claim any ability to stop or reverse a
              foreclosure. Duequity&apos;s work relates only to surplus funds
              arising after a property sale has already occurred.
            </p>

            <h2>Communications and consent</h2>
            <p>
              Duequity contacts prospective claimants only where permitted by
              applicable federal and state law, including restrictions on
              telephone and text message contact. Written outreach identifies
              Duequity by name, states that Duequity is not a government agency,
              cites the public record on which it is based, and includes a
              verification code. You may opt out of contact at any time and
              Duequity will honour that request on every channel.
            </p>

            <h2>Data and privacy</h2>
            <p>
              Duequity collects the minimum information necessary to evaluate
              and pursue a claim. Duequity does not request a Social Security
              number to perform a property search, and does not request identity
              documents before you have seen the underlying record and chosen to
              proceed. See <TextLink href="/privacy">privacy</TextLink> and{" "}
              <TextLink href="/security">security</TextLink>.
            </p>
          </Prose>

          <Callout
            tone="caution"
            className="mt-10"
            title="Duequity is pre-launch"
          >
            <div className="space-y-2">
              <p>
                Duequity has not activated any jurisdiction, has not accepted
                any claimant, and has not completed any recovery. No claim is
                currently being handled and no claimant data is held.
              </p>
              <p>
                Jurisdiction rules, fee ceilings, deadlines and statutory
                references appear on this site only where they have been
                recorded against the official sources named in that
                jurisdiction&apos;s compliance record. Where a value has not
                been established, the relevant page states that rather than
                filling the gap. A jurisdiction is not opened for intake until
                its rules and its payment routing have both been verified.
              </p>
              <p>
                Nothing on this site constitutes legal advice or an offer of
                service in any jurisdiction. Duequity is not a law firm and is
                not a government agency. Before Duequity accepts any claimant,
                that jurisdiction&apos;s rules are reviewed and recorded, and
                this page will be reviewed by counsel as well.
              </p>
            </div>
          </Callout>
        </Container>
      </Section>
    </>
  );
}
