"use server";

import {
  headers,
} from "next/headers";

import {
  redirect,
} from "next/navigation";

import {
  inviteAssignedLeadClaimantUser,
} from "@/server/assigned-lead-claimant-activation-service";

import {
  assertClaimantActivationPrerequisites,
  createClaimantFromConfirmedCall,
} from "@/server/claimant-intake-create-service";

import {
  inviteClaimantUser,
} from "@/server/claimant-invite-service";

import {
  resolveStaffSession,
} from "@/server/staff-session";

const ONBOARDING_PATH =
  "/pro/claimants/onboarding";

/* ========================================================================== */
/* Form helpers                                                                */
/* ========================================================================== */

function readFormValue(
  formData:
    FormData,
  name:
    string,
): string {
  const value =
    formData.get(
      name,
    );

  return typeof value ===
    "string"
    ? value.trim()
    : "";
}

function checked(
  formData:
    FormData,
  name:
    string,
): boolean {
  return (
    readFormValue(
      formData,
      name,
    ) ===
    "confirmed"
  );
}

function onboardingLocation({
  status,
  query,
  claimantId,
}: {
  status:
    string;

  query?:
    string;

  claimantId?:
    string;
}): string {
  const params =
    new URLSearchParams();

  params.set(
    "status",
    status,
  );

  if (
    query?.trim()
  ) {
    params.set(
      "q",
      query.trim(),
    );
  }

  if (
    claimantId?.trim()
  ) {
    params.set(
      "claimantId",
      claimantId.trim(),
    );
  }

  return `${ONBOARDING_PATH}?${params.toString()}`;
}

/* ========================================================================== */
/* Origin                                                                      */
/* ========================================================================== */

async function resolveRequestOrigin(): Promise<string> {
  const requestHeaders =
    await headers();

  const origin =
    requestHeaders
      .get(
        "origin",
      )
      ?.trim();

  if (origin) {
    return origin.replace(
      /\/+$/,
      "",
    );
  }

  const forwardedHost =
    requestHeaders
      .get(
        "x-forwarded-host",
      )
      ?.split(
        ",",
      )[0]
      ?.trim();

  const host =
    forwardedHost ||
    requestHeaders
      .get(
        "host",
      )
      ?.trim();

  const forwardedProto =
    requestHeaders
      .get(
        "x-forwarded-proto",
      )
      ?.split(
        ",",
      )[0]
      ?.trim();

  const protocol =
    forwardedProto ||
    (
      host?.startsWith(
        "localhost",
      ) ||
      host?.startsWith(
        "127.0.0.1",
      )
        ? "http"
        : "https"
    );

  if (!host) {
    throw new Error(
      "Unable to determine the DueQuity application origin.",
    );
  }

  return `${protocol}://${host}`;
}

/* ========================================================================== */
/* Claimant creation error routing                                             */
/* ========================================================================== */

function creationFailureStatus(
  failure:
    unknown,
): string {
  if (!(failure instanceof Error)) {
    return "claimant-create-unavailable";
  }

  const message =
    failure.message
      .trim()
      .toLowerCase();

  if (
    message.includes(
      "confirmed claimant name does not sufficiently match",
    )
  ) {
    return "source-name-mismatch";
  }

  if (
    message.includes(
      "connection to the displayed foreclosed property",
    )
  ) {
    return "property-confirmation-required";
  }

  if (
    message.includes(
      "permission for duequity to send secure activation materials",
    )
  ) {
    return "consent-required";
  }

  if (
    message.includes(
      "exactly one living individual former owner",
    ) ||
    message.includes(
      "recorded 100% ownership share",
    )
  ) {
    return "claimant-review-required";
  }

  if (
    message.includes(
      "claim not found",
    ) ||
    message.includes(
      "source opportunity could not be resolved",
    )
  ) {
    return "claim-not-found";
  }

  if (
    message.includes(
      "claim does not match its persisted source opportunity",
    )
  ) {
    return "record-mismatch";
  }

  if (
    message.includes(
      "no current approved jurisdiction rule",
    ) ||
    message.includes(
      "claimant intake is not authorized",
    ) ||
    message.includes(
      "claimant creation is blocked",
    )
  ) {
    return "intake-blocked";
  }

  if (
    message.includes(
      "not cleared to work on claimant intake",
    ) ||
    message.includes(
      "not authorized to create claimant onboarding records",
    ) ||
    message.includes(
      "not assigned to your duequity staff account",
    )
  ) {
    return "not-authorized";
  }

  return "claimant-create-unavailable";
}

/* ========================================================================== */
/* Existing Claim invitation error routing                                     */
/* ========================================================================== */

function invitationFailureStatus(
  failure:
    unknown,
): string {
  if (!(failure instanceof Error)) {
    return "unavailable";
  }

  const message =
    failure.message
      .trim()
      .toLowerCase();

  if (
    message.includes(
      "property has been confirmed and recorded",
    ) ||
    message.includes(
      "connection to the source property",
    )
  ) {
    return "property-confirmation-required";
  }

  if (
    message.includes(
      "email communication consent",
    ) ||
    message.includes(
      "consent to use the claimant's email",
    )
  ) {
    return "consent-required";
  }

  if (
    message.includes(
      "activation legal name does not match",
    )
  ) {
    return "legal-name-mismatch";
  }

  if (
    message.includes(
      "activation email does not match",
    )
  ) {
    return "email-mismatch";
  }

  if (
    message.includes(
      "activation mobile number does not match",
    )
  ) {
    return "mobile-mismatch";
  }

  if (
    message.includes(
      "saved claimant identity or contact record is incomplete",
    )
  ) {
    return "claimant-record-incomplete";
  }

  if (
    message.includes(
      "already has a my duequity authentication identity",
    )
  ) {
    return "already-active";
  }

  if (
    message.includes(
      "already has an active activation invitation",
    )
  ) {
    return "open-invitation";
  }

  if (
    message.includes(
      "selected claimant record could not be found",
    ) ||
    message.includes(
      "selected claimant onboarding record could not be resolved",
    )
  ) {
    return "claimant-not-found";
  }

  if (
    message.includes(
      "currently limited to individual claimants",
    )
  ) {
    return "claimant-review-required";
  }

  if (
    message.includes(
      "staff auth identity cannot be used as a claimant identity",
    )
  ) {
    return "auth-collision";
  }

  if (
    message.includes(
      "not authorized to create claimant activation invitations",
    ) ||
    message.includes(
      "not authorized to create claimant onboarding records",
    ) ||
    message.includes(
      "not assigned to your duequity staff account",
    )
  ) {
    return "not-authorized";
  }

  return "unavailable";
}

/* ========================================================================== */
/* Assigned-lead invitation error routing                                      */
/* ========================================================================== */

function assignedInvitationFailureStatus(
  failure:
    unknown,
): string {
  if (!(failure instanceof Error)) {
    return "unavailable";
  }

  const message =
    failure.message
      .trim()
      .toLowerCase();

  if (
    message.includes(
      "already has an active activation invitation",
    )
  ) {
    return "open-invitation";
  }

  if (
    message.includes(
      "staff auth identity cannot be used as a claimant identity",
    )
  ) {
    return "auth-collision";
  }

  if (
    message.includes(
      "saved assigned claimant contact information is incomplete",
    ) ||
    message.includes(
      "assigned claimant workcase is incomplete for activation",
    )
  ) {
    return "claimant-record-incomplete";
  }

  if (
    message.includes(
      "assigned claimant workcase not found",
    )
  ) {
    return "claimant-not-found";
  }

  if (
    message.includes(
      "not assigned to this staff account",
    ) ||
    message.includes(
      "not authorized to create claimant activation invitations",
    ) ||
    message.includes(
      "active administrator-authorized lead assignment not found",
    ) ||
    message.includes(
      "activation invitation is not owned by this staff account",
    )
  ) {
    return "not-authorized";
  }

  if (
    message.includes(
      "assigned claimant workcase is not ready for activation",
    ) ||
    message.includes(
      "assigned claimant workcase is no longer ready for activation",
    )
  ) {
    return "open-invitation";
  }

  return "unavailable";
}

/* ========================================================================== */
/* Create claimant from confirmed call                                         */
/* ========================================================================== */

export async function createClaimantFromConfirmedCallAction(
  formData:
    FormData,
) {
  const session =
    await resolveStaffSession();

  if (!session) {
    redirect(
      "/staff/sign-in",
    );
  }

  const claimId =
    readFormValue(
      formData,
      "claimId",
    );

  const legalFirstName =
    readFormValue(
      formData,
      "legalFirstName",
    );

  const legalLastName =
    readFormValue(
      formData,
      "legalLastName",
    );

  const email =
    readFormValue(
      formData,
      "email",
    );

  const mobilePhone =
    readFormValue(
      formData,
      "mobilePhone",
    );

  const query =
    readFormValue(
      formData,
      "q",
    );

  const propertyConnectionConfirmed =
    checked(
      formData,
      "propertyConnectionConfirmed",
    );

  const activationEmailConsentConfirmed =
    checked(
      formData,
      "activationEmailConsentConfirmed",
    );

  if (
    !claimId ||
    !legalFirstName ||
    !legalLastName ||
    !email ||
    !mobilePhone ||
    !propertyConnectionConfirmed ||
    !activationEmailConsentConfirmed
  ) {
    redirect(
      onboardingLocation({
        status:
          "claimant-create-invalid",

        query,
      }),
    );
  }

  let createdClaimantId =
    "";

  try {
    const result =
      await createClaimantFromConfirmedCall({
        session,

        claimId,

        legalFirstName,

        legalLastName,

        email,

        mobilePhone,

        propertyConnectionConfirmed,

        activationEmailConsentConfirmed,
      });

    createdClaimantId =
      result.claimantId;
  } catch (
    failure
  ) {
    const status =
      creationFailureStatus(
        failure,
      );

    redirect(
      onboardingLocation({
        status,

        query,
      }),
    );
  }

  redirect(
    onboardingLocation({
      status:
        "claimant-created",

      query,

      claimantId:
        createdClaimantId,
    }),
  );
}

/* ========================================================================== */
/* Existing Claim-backed invitation                                            */
/* ========================================================================== */

export async function sendClaimantActivationInvitation(
  formData:
    FormData,
) {
  const session =
    await resolveStaffSession();

  if (!session) {
    redirect(
      "/staff/sign-in",
    );
  }

  const claimantId =
    readFormValue(
      formData,
      "claimantId",
    );

  const legalFirstName =
    readFormValue(
      formData,
      "legalFirstName",
    );

  const legalLastName =
    readFormValue(
      formData,
      "legalLastName",
    );

  const email =
    readFormValue(
      formData,
      "email",
    );

  const mobilePhone =
    readFormValue(
      formData,
      "mobilePhone",
    );

  const confirmation =
    readFormValue(
      formData,
      "confirmation",
    );

  if (
    !claimantId ||
    !legalFirstName ||
    !legalLastName ||
    !email ||
    !mobilePhone ||
    confirmation !==
      "confirmed"
  ) {
    redirect(
      `${ONBOARDING_PATH}?status=invalid`,
    );
  }

  const origin =
    await resolveRequestOrigin();

  try {
    await assertClaimantActivationPrerequisites({
      session,

      claimantId,
    });

    await inviteClaimantUser({
      session,

      claimantId,

      legalFirstName,

      legalLastName,

      email,

      mobilePhone,

      redirectTo:
        `${origin}/auth/claimant-invite/callback`,
    });
  } catch (
    failure
  ) {
    const status =
      invitationFailureStatus(
        failure,
      );

    redirect(
      `${ONBOARDING_PATH}?status=${encodeURIComponent(
        status,
      )}`,
    );
  }

  redirect(
    `${ONBOARDING_PATH}?status=sent`,
  );
}

/* ========================================================================== */
/* Admin-assigned pre-Claim invitation                                         */
/* ========================================================================== */

export async function sendAssignedLeadClaimantActivationInvitation(
  formData:
    FormData,
) {
  const session =
    await resolveStaffSession();

  if (!session) {
    redirect(
      "/staff/sign-in",
    );
  }

  const workcaseId =
    readFormValue(
      formData,
      "workcaseId",
    );

  const query =
    readFormValue(
      formData,
      "q",
    );

  const confirmation =
    readFormValue(
      formData,
      "confirmation",
    );

  if (
    !workcaseId ||
    confirmation !==
      "confirmed"
  ) {
    redirect(
      onboardingLocation({
        status:
          "invalid",

        query,
      }),
    );
  }

  const origin =
    await resolveRequestOrigin();

  try {
    await inviteAssignedLeadClaimantUser({
      session,

      workcaseId,

      redirectTo:
        `${origin}/auth/claimant-invite/callback`,
    });
  } catch (
    failure
  ) {
    const status =
      assignedInvitationFailureStatus(
        failure,
      );

    redirect(
      onboardingLocation({
        status,

        query,
      }),
    );
  }

  /*
   * The same success status is intentionally shared with the established
   * Claim-backed invitation path.
   */
  redirect(
    onboardingLocation({
      status:
        "sent",

      query,
    }),
  );
}