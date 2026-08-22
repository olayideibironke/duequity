"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { resolveClaimantSession } from "@/server/claimant-session";
import { getSupabaseAdmin } from "@/server/supabase-admin";
import { getSupabaseServerAuth } from "@/server/supabase-auth";

const SECURITY_PATH =
  "/portal/security";

function readFormValue(
  formData: FormData,
  name: string,
): string {
  const value =
    formData.get(name);

  return typeof value === "string"
    ? value.trim()
    : "";
}

export async function deleteClaimantAccount(
  formData: FormData,
) {
  const confirmation =
    readFormValue(
      formData,
      "confirmation",
    );

  const password =
    readFormValue(
      formData,
      "password",
    );

  if (
    confirmation !== "DELETE" ||
    !password
  ) {
    redirect(
      `${SECURITY_PATH}?deleteStatus=invalid`,
    );
  }

  const claimantSession =
    await resolveClaimantSession();

  if (
    !claimantSession ||
    claimantSession.provider !== "supabase"
  ) {
    redirect(
      `${SECURITY_PATH}?deleteStatus=unauthorized`,
    );
  }

  const supabase =
    await getSupabaseServerAuth();

  const {
    data: {
      user,
    },
    error: userError,
  } =
    await supabase.auth.getUser();

  if (
    userError ||
    !user ||
    !user.email
  ) {
    redirect(
      `${SECURITY_PATH}?deleteStatus=unauthorized`,
    );
  }

  const {
    error: passwordError,
  } =
    await supabase.auth.signInWithPassword({
      email:
        user.email,

      password,
    });

  if (passwordError) {
    redirect(
      `${SECURITY_PATH}?deleteStatus=invalid-password`,
    );
  }

  const verifiedSession =
    await resolveClaimantSession();

  if (
    !verifiedSession ||
    verifiedSession.provider !== "supabase" ||
    verifiedSession.claimantId !== claimantSession.claimantId
  ) {
    await supabase.auth.signOut();

    redirect(
      `${SECURITY_PATH}?deleteStatus=unauthorized`,
    );
  }

  const admin =
    getSupabaseAdmin();

  const {
    error: deleteError,
  } =
    await admin.auth.admin.deleteUser(
      user.id,
    );

  if (deleteError) {
    redirect(
      `${SECURITY_PATH}?deleteStatus=failed`,
    );
  }

  /*
   * Supabase Auth deletion does not itself guarantee that the browser's
   * existing session cookies disappear immediately.
   *
   * Protected DueQuity surfaces already validate the user with getUser(), so
   * the deleted identity cannot regain portal access. This sign-out also clears
   * the current browser session when possible.
   */
  await supabase.auth.signOut();

  revalidatePath(
    "/",
    "layout",
  );

  redirect(
    "/claimant/sign-in?account=deleted",
  );
}