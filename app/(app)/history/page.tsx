import { createClient } from "@/lib/supabase/server";
import { requireActiveCompany } from "@/lib/auth/company";
import HistoryClient, { type PublishRecord } from "./HistoryClient";

export default async function HistoryPage() {
  await requireActiveCompany();
  const supabase = createClient();

  // Publishes newest first, each with its per-recipient email rows.
  const { data } = await supabase
    .from("publishes")
    .select(
      "id, work_date, preface_message, recipient_count, published_at, " +
        "emails(id, to_email, status, error, employee:employees(name))"
    )
    .order("published_at", { ascending: false });

  return <HistoryClient publishes={(data ?? []) as unknown as PublishRecord[]} />;
}
