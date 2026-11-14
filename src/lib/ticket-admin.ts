import { createClient } from "@/lib/supabase/server";

export async function requireTicketAdmin(allowedRoles: string[] = ["super_admin", "ticket_manager"]) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error("Authentication required");

  const { data: role, error: roleError } = await supabase.rpc("ticket_admin_role");
  if (roleError) throw new Error(`Ticket admin authorization failed: ${roleError.message}`);
  if (!role || !allowedRoles.includes(role)) throw new Error("Not authorized for ticket administration");

  return { supabase, user, role: role as string };
}
