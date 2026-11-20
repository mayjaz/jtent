import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
export async function GET(request: Request) {
 const { searchParams, origin } = new URL(request.url);
 const next = searchParams.get("next");
 const safeNext = next?.startsWith("/") && !next.startsWith("//") ? next : "/vote";
 const redirectWithError = (message: string) => {
  const destination = new URL(safeNext, origin);
  destination.searchParams.set("authError", message);
  return NextResponse.redirect(destination);
 };
 const authError = searchParams.get("error_description") ?? searchParams.get("error");
 if (authError) return redirectWithError("The sign-in link could not be verified. Request a fresh link and try again.");
 const code = searchParams.get("code");
 if (!code) return redirectWithError("The sign-in link is invalid or expired. Request a fresh link and try again.");
 const supabase = await createClient();
 const { error } = await supabase.auth.exchangeCodeForSession(code);
 if (error) return redirectWithError("The sign-in link could not be verified. Request a fresh link and try again.");
 return NextResponse.redirect(new URL(safeNext, origin));
}
