import "server-only";

import { getPublicMatch, type PublicMatch } from "@/server/public-search";

/**
 * OUTREACH VERIFICATION
 *
 * Resolves a verification code printed on Duequity outreach back to the public
 * record the outreach referred to.
 *
 * ============================ CURRENT BOUNDARY ============================
 * No outreach attempt store exists. Duequity has sent no letters, emails, calls
 * or messages, so there is no persisted verification code to resolve, and this
 * module therefore cannot report any code as genuine.
 *
 * That is the correct behaviour rather than a limitation. A verification page
 * whose failure mode is "maybe genuine" is worse than no page: the entire point
 * of the code is that an unrecognised code is a warning. Until outreach attempts
 * are persisted with their issued codes, every lookup must fail closed.
 *
 * When outreach is implemented, the `OutreachAttempt.verificationCode` field
 * already exists on the domain model. The only change required here is to resolve
 * the code against persisted outreach attempts, confirm the attempt has actually
 * been sent, and project the linked opportunity through `getPublicMatch`. The
 * public page does not change.
 * =========================================================================
 *
 * A code is never resolved by pattern, by guesswork, or by any client-supplied
 * hint. There is no list of example codes, because publishing codes that resolve
 * would teach visitors that a resolving code proves nothing.
 */

/** Codes printed on Duequity outreach are four characters. */
const VERIFICATION_CODE_PATTERN = /^[A-Z0-9]{4}$/;

export type OutreachVerificationResult =
  /** No code was submitted. */
  | { kind: "empty" }

  /** The submitted value cannot be a Duequity verification code at all. */
  | { kind: "malformed" }

  /** The code does not match any issued Duequity outreach. */
  | { kind: "not_found" }

  /** The code matches issued outreach; the referenced public record follows. */
  | { kind: "found"; match: PublicMatch };

export function normalizeVerificationCode(raw: string | undefined): string {
  return (raw ?? "").trim().toUpperCase();
}

/**
 * Resolve a verification code.
 *
 * Returns `not_found` for every well-formed code while no outreach attempt store
 * exists. `getPublicMatch` is imported and used below so that the projection path
 * is exercised the moment a persisted outreach attempt can supply a token; it is
 * never reached with a fabricated token.
 */
export async function lookupOutreachVerificationCode(
  raw: string | undefined,
): Promise<OutreachVerificationResult> {
  const code = normalizeVerificationCode(raw);

  if (!code) {
    return { kind: "empty" };
  }

  if (!VERIFICATION_CODE_PATTERN.test(code)) {
    return { kind: "malformed" };
  }

  /*
   * Resolve the code against issued outreach.
   *
   * No outreach attempt store exists, so there is nothing to resolve against and
   * the lookup yields no token. This must never fall through to a guess.
   */
  const publicToken = await resolveIssuedOutreachToken(code);

  if (!publicToken) {
    return { kind: "not_found" };
  }

  const match = await getPublicMatch(publicToken);

  if (!match) {
    return { kind: "not_found" };
  }

  return { kind: "found", match };
}

/**
 * The public-record token an issued outreach code refers to.
 *
 * Returns undefined until outreach attempts are persisted. When they are, this
 * function looks up the attempt by its `verificationCode`, confirms it was
 * actually sent, and returns the public token of the opportunity it referenced.
 */
async function resolveIssuedOutreachToken(
  code: string,
): Promise<string | undefined> {
  /*
   * No outreach attempt store exists, so there is nothing to look the code up
   * against. The parameter is retained because it is the lookup key the moment
   * outreach attempts are persisted, and dropping it would hide that this
   * function has a real signature to implement.
   */
  void code;

  return undefined;
}

/**
 * Whether any verification code can currently resolve.
 *
 * The public page uses this to explain why a code is not recognised, rather than
 * implying the visitor mistyped it.
 */
export function outreachVerificationAvailable(): boolean {
  return false;
}
