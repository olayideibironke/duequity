import type { Metadata } from "next";
import { Container, Prose, Section } from "@/components/public/section";
import { Callout } from "@/components/ui/surface";
import { TextLink } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Disclosures",
  description:
    "DueQuity disclosures covering government affiliation, self-claim options, legal services, jurisdiction-specific payment routing, fees, privacy, and recovery limitations.",
};

/**
 * DISCLOSURES
 *
 * The consolidated statement of DueQuity's standing public disclosures.
 *
 * Jurisdiction-specific filing, authorization, payment, fee, cancellation, and
 * legal requirements may differ. DueQuity follows the verified operating route
 * recorded for the jurisdiction handling each recovery.
 */
export default function DisclosuresPage() {
  return (
    <>
      <Section tone="ink" size="sm">
        <Container>
          <p className="eyebrow text-accent-300">Legal</p>

          <h1 className="mt-3 text-3xl text-white sm:text-4xl">
            Disclosures
          </h1>

          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-ink-300">
            These are DueQuity&apos;s standing public disclosures. Additional
            terms may apply to a particular recovery depending on the
            jurisdiction, payment route, claimant circumstances, and services
            involved. Applicable terms are disclosed before you enter into a
            service agreement.
          </p>
        </Container>
      </Section>

      <Section tone="paper" size="md">
        <Container width="reading">
          <Prose>
            <h2>DueQuity is not a government agency</h2>

            <p>
              DueQuity is a private company operated by Westforge Holdings Inc.
              DueQuity is not a government agency, is not affiliated with or
              endorsed by any government agency, and does not represent itself
              as a court, county, sheriff, trustee, tax authority, or state
              office.
            </p>

            <h2>You may be able to claim surplus funds yourself at no cost</h2>

            <p>
              Depending on the jurisdiction and your eligibility, you may be
              able to submit a surplus claim directly to the agency, court,
              trustee, or other authority responsible for the funds without
              using a recovery service and without paying DueQuity a service
              fee.
            </p>

            <p>
              DueQuity can identify the responsible authority and explain the
              recovery route we have established for the jurisdiction whether
              or not you choose to engage DueQuity. See{" "}
              <TextLink href="/states">where we operate</TextLink> for
              jurisdiction information.
            </p>

            <h2>DueQuity is not a law firm</h2>

            <p>
              DueQuity does not practice law, provide legal advice, or represent
              claimants as attorneys. DueQuity provides recovery-related
              research, document coordination, administrative assistance,
              operational communication, and other non-legal services that are
              permitted for the applicable jurisdiction.
            </p>

            <p>
              When a recovery requires legal advice, court representation, an
              estate proceeding, resolution of competing legal interests, or
              other work that must be performed by licensed counsel, you may
              engage an independent attorney of your choice. DueQuity may
              continue coordinating the non-legal portions of the recovery where
              appropriate.
            </p>

            <p>
              Any attorney-client relationship is separate from your
              relationship with DueQuity. Attorney services and attorney fees
              are governed by your agreement with the attorney or law firm.
              DueQuity does not share in attorney fees.
            </p>

            <h2>Payment procedures vary by jurisdiction</h2>

            <p>
              The permitted payment route depends on the rules and procedures
              applicable to the authority handling the recovery. Funds may be
              paid directly to the claimant, an estate, authorized counsel, or
              through an authorized representative payment process where that
              route is permitted.
            </p>

            <p>
              Where applicable law, the jurisdiction&apos;s approved process,
              and your written authorization permit representative payment,
              DueQuity may receive or process recovery funds through that
              approved route. Where payment must instead be made directly to the
              claimant, estate, or counsel, DueQuity follows that requirement.
            </p>

            <p>
              The payment route applicable to your recovery is disclosed before
              DueQuity files or coordinates submission of the recovery package.
            </p>

            <h2>DueQuity does not purchase claims</h2>

            <p>
              DueQuity does not purchase surplus claims, take assignments of
              surplus ownership rights, or acquire an ownership interest in a
              claimant&apos;s recovery. DueQuity provides recovery services
              under a written service agreement.
            </p>

            <p>
              Receiving or processing a payment through an authorized
              representative payment route, where legally permitted, does not
              transfer ownership of the underlying surplus claim or recovery
              rights to DueQuity.
            </p>

            <h2>No guarantee of recovery</h2>

            <p>
              DueQuity does not guarantee that a claim will be approved, that
              any particular amount will be recovered, or that recovery will
              occur within a particular period.
            </p>

            <p>
              Decisions and payment timing may be controlled by an agency,
              court, county, trustee, tax authority, or other responsible
              authority. A potential recovery may also be affected by liens,
              judgments, taxes, senior interests, probate requirements,
              competing claims, filing deadlines, ownership issues, or other
              circumstances.
            </p>

            <h2>Fees</h2>

            <p>
              DueQuity&apos;s service fee is disclosed in writing before you
              enter into a service agreement. The applicable fee structure,
              timing, permitted collection method, and any statutory or
              regulatory ceiling depend on the jurisdiction and recovery route.
            </p>

            <p>
              Where a jurisdiction limits the amount a recovery service may
              charge, DueQuity will not charge more than the permitted limit.
              If no amount is recovered, no DueQuity recovery service fee is
              charged.
            </p>

            <p>
              Where recovery funds are paid directly to you, the agreed service
              fee may be handled separately in accordance with your agreement.
              Where an authorized representative payment route permits fee
              handling through the recovery or disbursement process, that method
              is disclosed in writing before you authorize it.
            </p>

            <p>
              See <TextLink href="/fees">fees</TextLink> for additional
              information about DueQuity&apos;s fee structure.
            </p>

            <h2>Right to cancel</h2>

            <p>
              Cancellation rights and required cancellation periods vary by
              jurisdiction. Where applicable law provides a cancellation
              period, the applicable right and procedure are stated in your
              service agreement.
            </p>

            <p>
              DueQuity follows the cancellation requirements established for
              the jurisdiction governing the recovery.
            </p>

            <h2>Not a foreclosure rescue or debt relief service</h2>

            <p>
              DueQuity does not provide foreclosure rescue, loan modification,
              mortgage negotiation, credit repair, or debt relief services.
              DueQuity does not claim an ability to stop or reverse a
              foreclosure.
            </p>

            <p>
              DueQuity&apos;s surplus recovery services concern funds that may
              remain after a foreclosure, tax sale, or similar property sale has
              already occurred.
            </p>

            <h2>Communications and consent</h2>

            <p>
              DueQuity conducts outreach and claimant communications subject to
              applicable federal and state requirements and any restrictions
              that apply to the communication channel or jurisdiction.
            </p>

            <p>
              DueQuity identifies itself as a private recovery service and does
              not represent outreach as coming from a government agency. You
              may request that DueQuity stop contacting you, and applicable
              opt-out requests are honored across the relevant communication
              channels.
            </p>

            <h2>Data and privacy</h2>

            <p>
              DueQuity seeks to collect only information reasonably necessary
              for the applicable stage of a recovery. A public property search
              does not require you to provide a Social Security number.
            </p>

            <p>
              Sensitive identity or supporting documents are requested only
              where they are reasonably necessary for claimant verification,
              authorization, filing, payment, compliance, or another legitimate
              recovery requirement.
            </p>

            <p>
              See <TextLink href="/privacy">privacy</TextLink> and{" "}
              <TextLink href="/security">security</TextLink> for additional
              information.
            </p>
          </Prose>

          <Callout
            tone="neutral"
            className="mt-10"
            title="Jurisdiction-specific requirements control"
          >
            <div className="space-y-2">
              <p>
                Surplus recovery procedures are not uniform nationwide. Filing
                authority, claimant eligibility, representation rules, payment
                routing, fee limits, deadlines, cancellation rights, and legal
                requirements can differ by state, county, court, agency, and
                type of sale.
              </p>

              <p>
                DueQuity uses the recovery route established for the applicable
                jurisdiction rather than applying one national process to every
                claim. A jurisdiction&apos;s operating route may require direct
                claimant payment, may permit authorized representative payment,
                or may require attorney involvement for particular steps.
              </p>

              <p>
                Where a material jurisdictional requirement has not been
                established with sufficient confidence, DueQuity does not treat
                the missing information as permission to proceed. The recovery
                remains subject to additional review until the appropriate route
                is established.
              </p>

              <p>
                Nothing on this page is legal advice. DueQuity is not a law firm
                and is not a government agency.
              </p>
            </div>
          </Callout>
        </Container>
      </Section>
    </>
  );
}