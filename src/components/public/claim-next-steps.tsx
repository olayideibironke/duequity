import type { DocumentKind } from "@/domain/types";
import { DOCUMENT_KIND_LABEL } from "@/domain/status";
import { ButtonLink, TextLink } from "@/components/ui/button";
import { Callout, Card, CardBody, CardHeader } from "@/components/ui/surface";
import { Checklist } from "@/components/ui/timeline";
import { Badge } from "@/components/ui/badge";

/**
 * WHAT HAPPENS NEXT
 *
 * The public surface shown to someone who has found a record that may concern
 * them.
 *
 * ===================== WHY THIS IS NOT AN INTAKE FORM =====================
 * A four-step intake wizard previously stood here. It asked for the visitor's
 * relationship to the former owner, whether that owner had died, whether other
 * heirs existed, their full name, their email address and their phone number,
 * then displayed "Request received" and discarded every answer.
 *
 * There is no public intake store and no claimant authentication, so there was
 * nowhere for any of it to go. Collecting a bereavement and a phone number behind
 * a confirmation screen, from someone who has just been told they may be owed
 * money, is the exact pattern this product exists to be the opposite of.
 *
 * So this surface does the part that is real: it tells the visitor what this
 * jurisdiction actually requires, what their situation is likely to change, that
 * they can do the whole thing themselves for free, and how to reach a person.
 *
 * When claimant onboarding is reachable from the public site, intake returns here
 * as a form that persists what it collects and tells the claimant where it went.
 * ==========================================================================
 */

export function ClaimNextSteps({
  jurisdictionName,
  agencyName,
  intake,
  intakeExplanation,
  probateRequired,
  requiredDocuments,
  disclosures,
  jurisdictionHref,
}: {
  jurisdictionName: string;
  agencyName: string;
  intake: "open" | "attorney_required" | "closed";
  intakeExplanation: string;
  probateRequired: boolean;
  requiredDocuments: DocumentKind[];
  disclosures: {
    key: string;
    text: string;
    requiresAcknowledgement: boolean;
  }[];
  jurisdictionHref: string;
}) {
  return (
    <div className="space-y-6">
      {/* ------------------------------------------------- intake position */}
      <Callout
        tone={
          intake === "open"
            ? "positive"
            : intake === "attorney_required"
              ? "counsel"
              : "caution"
        }
        title={
          intake === "open"
            ? `Duequity can assist with a claim in ${jurisdictionName}`
            : intake === "attorney_required"
              ? `A claim in ${jurisdictionName} must be filed by an attorney`
              : `Duequity is not accepting claims in ${jurisdictionName}`
        }
      >
        <p>{intakeExplanation}</p>
      </Callout>

      {/* --------------------------------------------------- the free path */}
      <Card>
        <CardHeader
          title="You can claim this yourself, for free"
          description="This is the first thing we want you to know, not the last."
        />
        <CardBody>
          <p className="text-md leading-relaxed text-ink-700">
            A former owner or eligible heir can normally file a surplus claim
            directly with {agencyName} and pay no service fee at all. The
            agency&rsquo;s published contact details, claim method, deadline and
            document list are on the{" "}
            <TextLink href={jurisdictionHref}>
              jurisdiction page for {jurisdictionName}
            </TextLink>
            .
          </p>

          <p className="mt-3 text-md leading-relaxed text-ink-700">
            We will tell you which agency holds the funds whether or not you
            hire us. What Duequity offers instead is the work: locating the
            record, jurisdiction expertise, obtaining documents that are
            difficult to get, handling estate and heir situations, and following
            the claim through to payment.
          </p>
        </CardBody>
      </Card>

      {/* ---------------------------------------------------- requirements */}
      <Card>
        <CardHeader
          title={`Documents ${agencyName} requires`}
          description="The baseline list recorded for a standard claim here. Your circumstances may add to it."
        />
        <CardBody>
          {requiredDocuments.length > 0 ? (
            <Checklist
              items={requiredDocuments.map((kind) => ({
                key: kind,
                label: DOCUMENT_KIND_LABEL[kind],
                satisfied: false,
                blocking: true,
              }))}
            />
          ) : (
            <p className="text-md text-ink-500">
              Document requirements have not yet been recorded for this
              jurisdiction.
            </p>
          )}

          {probateRequired && (
            <Callout
              tone="counsel"
              className="mt-4"
              title="If the owner of record has died"
            >
              <p>
                {jurisdictionName} generally requires an opened estate before
                the agency will release funds to heirs. Estate work is legal
                work and is handled by independent licensed counsel whom you
                engage directly. Duequity does not give legal advice and takes
                no part of an attorney&rsquo;s fee.
              </p>
            </Callout>
          )}
        </CardBody>
      </Card>

      {/* ----------------------------------------------------- disclosures */}
      {disclosures.length > 0 && (
        <Card>
          <CardHeader
            title="What you would be told before signing anything"
            description="These are presented in writing and acknowledged individually. Nothing is signed on this page."
          />
          <CardBody>
            <ul className="space-y-3">
              {disclosures.map((disclosure) => (
                <li key={disclosure.key} className="flex gap-3">
                  <span
                    aria-hidden="true"
                    className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent-500"
                  />
                  <div className="min-w-0">
                    <p className="text-md leading-relaxed text-ink-700">
                      {disclosure.text}
                    </p>
                    {disclosure.requiresAcknowledgement && (
                      <p className="mt-1">
                        <Badge tone="neutral">Acknowledgement recorded</Badge>
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}

      {/* --------------------------------------------------------- contact */}
      <Card elevated>
        <CardHeader
          title="Talk to a person"
          description="There is no online application to complete. Nothing is collected on this page."
        />
        <CardBody>
          <p className="text-md leading-relaxed text-ink-700">
            Write to us with the property address, the county, and the case or
            list reference shown alongside this record. Please do not send a
            Social Security number, bank details or images of identity documents
            in a first message.
          </p>

          <div className="mt-5">
            <ButtonLink href="/contact" variant="primary" accent>
              How to contact us
            </ButtonLink>
          </div>

          <p className="mt-4 text-xs leading-relaxed text-ink-500">
            Duequity is not a government agency and is not a law firm. We do not
            purchase, acquire or take assignment of surplus claims, and we are
            never a payee on an agency disbursement.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}