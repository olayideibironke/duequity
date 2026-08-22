import type { Metadata } from "next";

import { IDENTITY_STATUS } from "@/domain/status";

import {
  Callout,
  Card,
  CardBody,
  CardHeader,
  DataItem,
  DataList,
  EmptyState,
  NotRecorded,
} from "@/components/ui/surface";

import { Badge, Identifier, StatusBadge } from "@/components/ui/badge";

import { TextLink } from "@/components/ui/button";

import { formatDate, formatPhone } from "@/lib/format";

import { resolveClaimantSession } from "@/server/claimant-session";

import { ClaimantAuthenticationRequired } from "@/components/ui/authentication-required";

import { listClaimantOnboardings } from "@/server/claimant-onboarding-store";

export const metadata: Metadata = {
  title: "Profile",
};

export const dynamic = "force-dynamic";

/* ========================================================================== */
/* Helpers                                                                     */
/* ========================================================================== */

function contactChannelLabel(
  channel: "email" | "phone_call" | "sms" | "mail",
): string {
  switch (channel) {
    case "email":
      return "Email";

    case "phone_call":
      return "Telephone";

    case "sms":
      return "Text message";

    case "mail":
      return "Mail";
  }
}

function languageLabel(language: string): string {
  switch (language.toLowerCase()) {
    case "en":
      return "English";

    case "es":
      return "Spanish";

    default:
      return language.toUpperCase();
  }
}

/* ========================================================================== */
/* Page                                                                        */
/* ========================================================================== */

export default async function PortalProfilePage() {
  /*
   * Temporary claimant-session boundary.
   *
   * Claimant identity is no longer selected by URL parameters. Production
   * authentication will replace the current session implementation later.
   */
  const session = await resolveClaimantSession();

  if (!session) {
    return <ClaimantAuthenticationRequired />;
  }

  const onboardings = await listClaimantOnboardings();

  const onboarding = onboardings.find(
    (record) => record.claimant.id === session.claimantId,
  );

  if (!onboarding) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl">Your profile</h1>

          <p className="mt-1.5 text-md text-ink-600">
            Information connected to your Duequity recovery account.
          </p>
        </div>

        <EmptyState
          title="No claimant profile connected"
          description="No persisted claimant onboarding record is connected to the current claimant session."
        />
      </div>
    );
  }

  const claimant = onboarding.claimant;

  const email = claimant.contactMethods.find(
    (method) => method.kind === "email",
  );

  const mobile = claimant.contactMethods.find(
    (method) => method.kind === "mobile",
  );

  return (
    <div className="space-y-6">
      {/* ================================================================ header */}
      <div>
        <h1 className="text-2xl sm:text-3xl">Your profile</h1>

        <p className="mt-1.5 text-md text-ink-600">
          Information currently recorded for your Duequity recovery account.
        </p>
      </div>

      {/* ============================================================= identity */}
      <Card>
        <CardHeader
          title="Identity"
          description="Claimant information recorded through the onboarding workflow."
          actions={
            <StatusBadge
              status={IDENTITY_STATUS[claimant.identityVerification]}
              audience="claimant"
              size="md"
            />
          }
        />

        <CardBody>
          <DataList columns={2}>
            <DataItem label="Legal name">{claimant.legalName}</DataItem>

            <DataItem label="Preferred name">
              {claimant.preferredName ? (
                claimant.preferredName
              ) : (
                <NotRecorded label="Not set" />
              )}
            </DataItem>

            <DataItem label="Claimant reference">
              <Identifier>{claimant.reference}</Identifier>
            </DataItem>

            <DataItem label="Identity status">
              <StatusBadge
                status={IDENTITY_STATUS[claimant.identityVerification]}
                audience="claimant"
              />
            </DataItem>

            <DataItem label="Identity confirmed">
              {claimant.identityVerifiedAt ? (
                formatDate(claimant.identityVerifiedAt)
              ) : (
                <NotRecorded label="Not yet confirmed" />
              )}
            </DataItem>

            <DataItem label="Date of birth">
              {claimant.dateOfBirth ? (
                formatDate(claimant.dateOfBirth)
              ) : (
                <NotRecorded label="Not recorded" />
              )}
            </DataItem>

            <DataItem label="Preferred language">
              {languageLabel(claimant.preferredLanguage)}
            </DataItem>

            <DataItem label="Account created">
              {formatDate(claimant.createdAt)}
            </DataItem>

            {claimant.accessibilityNote && (
              <DataItem label="Accessibility preference" span>
                {claimant.accessibilityNote}
              </DataItem>
            )}
          </DataList>
        </CardBody>
      </Card>

      {/* ============================================================= contact */}
      <Card>
        <CardHeader
          title="Contact information"
          description="Contact details currently recorded through claimant onboarding."
        />

        <CardBody>
          <DataList columns={2}>
            <DataItem label="Email">
              {email ? (
                <span className="flex flex-wrap items-center gap-2">
                  <span>{email.value}</span>

                  <Badge tone={email.verified ? "positive" : "caution"}>
                    {email.verified ? "Verified" : "Not verified"}
                  </Badge>
                </span>
              ) : (
                <NotRecorded />
              )}
            </DataItem>

            <DataItem label="Mobile">
              {mobile ? (
                <span className="flex flex-wrap items-center gap-2">
                  <span>{formatPhone(mobile.value)}</span>

                  <Badge tone={mobile.verified ? "positive" : "caution"}>
                    {mobile.verified ? "Verified" : "Not verified"}
                  </Badge>
                </span>
              ) : (
                <NotRecorded label="Not provided" />
              )}
            </DataItem>

            <DataItem label="Preferred contact">
              {contactChannelLabel(claimant.preferredContactChannel)}
            </DataItem>

            <DataItem label="Contact consent">
              {claimant.consentRecordedAt ? (
                formatDate(claimant.consentRecordedAt)
              ) : (
                <NotRecorded label="Not recorded" />
              )}
            </DataItem>

            {claimant.consentSource && (
              <DataItem label="Consent source" span>
                {claimant.consentSource}
              </DataItem>
            )}

            {claimant.mailingAddress && (
              <DataItem label="Mailing address" span>
                <span className="block">{claimant.mailingAddress.line1}</span>

                {claimant.mailingAddress.line2 && (
                  <span className="block">{claimant.mailingAddress.line2}</span>
                )}

                <span className="block">
                  {claimant.mailingAddress.city},{" "}
                  {claimant.mailingAddress.state}{" "}
                  {claimant.mailingAddress.postalCode}
                </span>
              </DataItem>
            )}
          </DataList>
        </CardBody>
      </Card>

      {/* ============================================================= changes */}
      <Callout tone="neutral" title="Need to update something?">
        <p>
          Self-service profile editing is not enabled yet. Duequity should not
          change claimant identity or contact information through an unverified
          browser action. Profile updates will be connected to the authenticated
          claimant workflow during the production authentication phase.
        </p>
      </Callout>

      {/* ============================================================= privacy */}
      <Card>
        <CardHeader
          title="Sensitive information"
          description="The claimant onboarding profile deliberately keeps sensitive identifiers out of this record."
        />

        <CardBody>
          <ul className="space-y-3">
            <li className="flex gap-2.5">
              <Badge tone="neutral" className="mt-0.5 shrink-0">
                Not stored here
              </Badge>

              <div>
                <p className="text-base font-medium text-ink-900">
                  Social Security number
                </p>

                <p className="mt-0.5 text-sm leading-relaxed text-ink-600">
                  The persisted claimant onboarding record does not contain a
                  Social Security number.
                </p>
              </div>
            </li>

            <li className="flex gap-2.5">
              <Badge tone="neutral" className="mt-0.5 shrink-0">
                Not stored here
              </Badge>

              <div>
                <p className="text-base font-medium text-ink-900">
                  Government identifier
                </p>

                <p className="mt-0.5 text-sm leading-relaxed text-ink-600">
                  Government identifier values are not fields on the persisted
                  claimant onboarding record.
                </p>
              </div>
            </li>

            <li className="flex gap-2.5">
              <Badge tone="neutral" className="mt-0.5 shrink-0">
                Not stored here
              </Badge>

              <div>
                <p className="text-base font-medium text-ink-900">
                  Identity-document image
                </p>

                <p className="mt-0.5 text-sm leading-relaxed text-ink-600">
                  Identity-document images are not stored inside the claimant
                  profile record.
                </p>
              </div>
            </li>
          </ul>
        </CardBody>
      </Card>

      {/* ============================================================= notice */}
      <Callout tone="neutral" title="Privacy">
        <p>
          For information about how Duequity handles personal information,
          review{" "}
          <TextLink href="/privacy" className="text-sm">
            the privacy notice
          </TextLink>
          .
        </p>
      </Callout>
    </div>
  );
}