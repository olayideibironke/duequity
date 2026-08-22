import { revalidatePath } from "next/cache";
import {
  type NextRequest,
  NextResponse,
} from "next/server";

import { getSupabaseServerAuth } from "@/server/supabase-auth";

export async function POST(
  request: NextRequest,
) {
  const supabase =
    await getSupabaseServerAuth();

  await supabase.auth.signOut();

  revalidatePath(
    "/",
    "layout",
  );

  return NextResponse.redirect(
    new URL(
      "/",
      request.url,
    ),
    {
      status: 303,
    },
  );
}