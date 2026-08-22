import type { Metadata } from "next";

import { IDENTITY_STATUS } from "@/domain/status";

import {
  claimantOnboardingStatus,
  listClaimantOnboardings,
  type ClaimantOnboardingStatus,
  type PersistedClaimantOnboarding,
} from "@/server/claimant-onboarding-store";

import { resolveClaimRecord } from "@/server/claim-record";

import { Card, EmptyState } from "@/components/ui/surface";

import { Badge, StatusBadge } from "@/components/ui/badge";

import {
  RecordList,
  RecordListItem,
  Table,
  TableRegion,
  TableToolbar,
  TBody,
  TD,
  TDPrimary,
  TH,
  THead,
  TR,
} from "@/components/ui/table";

import { formatDate, formatPhone, plural } from "@/lib/format";

import { resolveStaffSession } from "@/server/staff-session";
import { StaffAuthenticationRequired } from "@/components/ui/authentication-required";

export const metadata: Metadata = {
  title: "Claimants",
};

export const dynamic = "force-dynamic";

/* ========================================================================== */
/* Types                                                                       */
/* ========================================================================== */

interface ClaimantRegisterRecord {
  onboarding: PersistedClaimantOnboarding;

  claimCount: number;

  claimReferences: string[];

  onboardingStatus: ClaimantOnboardingStatus;
}

/* ========================================================================== */
/* Helpers                                                                     */
/* ========================================================================== */

function onboardingStatusLabel(status: ClaimantOnboardingStatus): string {
  switch (status) {
    case "identity_pending":
      return "Identity pending";

    case "disclosures_pending":
      return "Disclosures pending";

    case "agreement_pending":
      return "Agreement pending";

    case "complete":
      return "Complete";

    default:
      return status;
  }
}

function onboardingStatusTone(
  status: ClaimantOnboardingStatus,
): "positive" | "caution" | "neutral" {
  switch (status) {
    case "complete":
      return "positive";

    case "identity_pending":
    case "disclosures_pending":
    case "agreement_pending":
      return "caution";

    default:
      return "neutral";
  }
}

function primaryEmail(onboarding: PersistedClaimantOnboarding) {
  return onboarding.claimant.contactMethods.find(
    (method) => method.kind === "email",
  );
}

function mobilePhone(onboarding: PersistedClaimantOnboarding) {
  return onboarding.claimant.contactMethods.find(
    (method) => method.kind === "mobile",
  );
}

/* ========================================================================== */
/* Production register loader                                                  */
/* ========================================================================== */

async function loadClaimantRegister(): Promise<ClaimantRegisterRecord[]> {
  const onboardings = await listClaimantOnboardings();

  /*
   * Group by persisted claimant ID rather than assuming one claimant always
   * equals one claim.
   *
   * The present local onboarding store normally creates one onboarding record
   * per claimant, but the register should not duplicate a claimant if the
   * persistence model later supports multiple claim links.
   */
  const grouped = new Map<string, PersistedClaimantOnboarding[]>();

  for (const onboarding of onboardings) {
    const existing = grouped.get(onboarding.claimant.id) ?? [];

    existing.push(onboarding);

    grouped.set(onboarding.claimant.id, existing);
  }

  const records = await Promise.all(
    [...grouped.values()].map(async (claimantOnboardings) => {
      const sorted = [...claimantOnboardings].sort((left, right) =>
        right.updatedAt.localeCompare(left.updatedAt),
      );

      const latest = sorted[0];

      const resolvedClaims = await Promise.all(
        sorted.map((onboarding) => resolveClaimRecord(onboarding.claimId)),
      );

      const existingClaims = resolvedClaims.filter((result) => Boolean(result));

      const claimReferences = [
        ...new Set(existingClaims.map((result) => result!.claim.reference)),
      ];

      return {
        onboarding: latest,

        claimCount: existingClaims.length,

        claimReferences,

        onboardingStatus: claimantOnboardingStatus(latest),
      };
    }),
  );

  return records.sort((left, right) =>
    right.onboarding.updatedAt.localeCompare(left.onboarding.updatedAt),
  );
}

/* ========================================================================== */
/* Page                                                                        */
/* ========================================================================== */

export default async function ProClaimantsPage() {
  /*
   * Server-side session gate.
   *
   * Resolved before any store read. The layout also withholds the operations
   * shell, but layout and page render in parallel, so the page must refuse to
   * read operational data on its own account.
   */
  if (!(await resolveStaffSession())) {
    return <StaffAuthenticationRequired />;
  }

  const claimants = await loadClaimantRegister();

  const incomplete = claimants.filter(
    (record) => record.onboardingStatus !== "complete",
  );

  return (
    <div className="space-y-5">
      {/* ================================================================ header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="eyebrow text-ink-500">Work</p>

          <h1 className="mt-1.5 text-2xl">Claimants</h1>

          <p className="mt-1 max-w-3xl text-sm text-ink-600">
            Persisted claimant records linked to Duequity recovery claims.
            Sensitive identity information is deliberately excluded from this
            register.
          </p>
        </div>
      </div>

      {/* ======================================================== attention callout */}
      {incomplete.length > 0 && (
        <div className="rounded-md border border-caution-200 bg-caution-50 px-4 py-3">
          <p className="text-sm font-semibold text-caution-800">
            {incomplete.length} {plural(incomplete.length, "claimant")} still
            have onboarding controls to complete.
          </p>

          <p className="mt-1 text-sm leading-relaxed text-ink-700">
            Identity verification, required disclosures, and service-agreement
            acceptance remain separate persisted controls.
          </p>
        </div>
      )}

      {/* ================================================================ register */}
      {claimants.length === 0 ? (
        <EmptyState
          title="No production claimants yet"
          description="Claimants will appear here after claimant onboarding has been started for a persisted recovery claim."
        />
      ) : (
        <Card className="overflow-hidden">
          <TableToolbar
            count={claimants.length}
            noun={{
              one: "claimant",

              many: "claimants",
            }}
          />

          {/* ============================================================ desktop */}
          <div className="hidden lg:block">
            <TableRegion label="Claimant register">
              <Table caption="Persisted claimants with identity, onboarding, contact, consent and linked claim status">
                <THead>
                  <TH>Claimant</TH>

                  <TH width="12%">Reference</TH>

                  <TH width="14%">Identity</TH>

                  <TH width="16%">Onboarding</TH>

                  <TH width="18%">Contact</TH>

                  <TH width="10%">Claims</TH>

                  <TH width="12%">Consent</TH>
                </THead>

                <TBody>
                  {claimants.map((record) => {
                    const {
                      onboarding,
                      onboardingStatus,
                      claimCount,
                      claimReferences,
                    } = record;

                    const claimant = onboarding.claimant;

                    const email = primaryEmail(onboarding);

                    const mobile = mobilePhone(onboarding);

                    return (
                      <TR
                        key={claimant.id}
                        tone={
                          onboardingStatus !== "complete"
                            ? "caution"
                            : undefined
                        }
                      >
                        <TDPrimary
                          href={`/pro/claimants/${claimant.id}`}
                          secondary={
                            claimant.preferredName
                              ? `Preferred name: ${claimant.preferredName}`
                              : `Created ${formatDate(claimant.createdAt)}`
                          }
                        >
                          {claimant.legalName}
                        </TDPrimary>

                        <TD nowrap>
                          <span className="font-mono text-xs text-ink-600">
                            {claimant.reference}
                          </span>
                        </TD>

                        <TD>
                          <StatusBadge
                            status={
                              IDENTITY_STATUS[claimant.identityVerification]
                            }
                          />

                          {claimant.identityVerifiedAt && (
                            <span className="mt-0.5 block text-2xs text-ink-400">
                              Verified {formatDate(claimant.identityVerifiedAt)}
                            </span>
                          )}
                        </TD>

                        <TD>
                          <Badge tone={onboardingStatusTone(onboardingStatus)}>
                            {onboardingStatusLabel(onboardingStatus)}
                          </Badge>

                          {onboarding.serviceAgreement && (
                            <span className="mt-0.5 block text-2xs text-ink-400">
                              Agreement signed{" "}
                              {formatDate(onboarding.serviceAgreement.signedAt)}
                            </span>
                          )}
                        </TD>

                        <TD>
                          {email && (
                            <span className="block truncate text-xs text-ink-700">
                              {email.value}

                              {email.verified && (
                                <span className="ml-1 text-accent-700">
                                  verified
                                </span>
                              )}
                            </span>
                          )}

                          {mobile && (
                            <span className="mt-0.5 block text-2xs text-ink-500">
                              {formatPhone(mobile.value)}

                              {mobile.verified ? " / verified" : ""}
                            </span>
                          )}
                        </TD>

                        <TD numeric>
                          <span className="text-sm text-ink-800">
                            {claimCount}
                          </span>

                          {claimReferences.length > 0 && (
                            <span
                              className="mt-0.5 block max-w-28 truncate font-mono text-2xs text-ink-400"
                              title={claimReferences.join(", ")}
                            >
                              {claimReferences.join(", ")}
                            </span>
                          )}
                        </TD>

                        <TD nowrap>
                          {claimant.consentRecordedAt ? (
                            <>
                              <Badge tone="positive">Recorded</Badge>

                              <span className="mt-0.5 block text-2xs text-ink-400">
                                {formatDate(claimant.consentRecordedAt)}
                              </span>
                            </>
                          ) : (
                            <Badge tone="caution">Not recorded</Badge>
                          )}
                        </TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            </TableRegion>
          </div>

          {/* ============================================================= mobile */}
          <div className="lg:hidden">
            <RecordList>
              {claimants.map((record) => {
                const { onboarding, onboardingStatus, claimCount } = record;

                const claimant = onboarding.claimant;

                const email = primaryEmail(onboarding);

                return (
                  <RecordListItem
                    key={claimant.id}
                    href={`/pro/claimants/${claimant.id}`}
                    title={claimant.legalName}
                    subtitle={claimant.reference}
                    status={
                      <StatusBadge
                        status={IDENTITY_STATUS[claimant.identityVerification]}
                      />
                    }
                    tone={
                      onboardingStatus !== "complete" ? "caution" : undefined
                    }
                    facts={[
                      {
                        label: "Onboarding",

                        value: onboardingStatusLabel(onboardingStatus),
                      },
                      {
                        label: "Claims",

                        value: String(claimCount),
                      },
                      {
                        label: "Contact",

                        value: email?.value ?? "Not recorded",
                      },
                      {
                        label: "Consent",

                        value: claimant.consentRecordedAt
                          ? formatDate(claimant.consentRecordedAt)
                          : "Not recorded",
                      },
                    ]}
                  />
                );
              })}
            </RecordList>
          </div>
        </Card>
      )}

      {/* ============================================================ privacy note */}
      <p className="text-xs leading-relaxed text-ink-500">
        Sensitive identifiers and identity-document contents are deliberately
        absent from this register. The claimant onboarding store does not
        persist Social Security numbers or government identity-document images.
      </p>
    </div>
  );
}