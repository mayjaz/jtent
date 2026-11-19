import { createClient } from "@/lib/supabase/server";
import { TicketAdminPanel } from "./ticket-admin-panel";

export const dynamic = "force-dynamic";

export default async function TicketAdminPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: role } = user ? await supabase.rpc("ticket_admin_role") : { data: null };

  return <TicketAdminPanel role={role ?? null} />;
}
