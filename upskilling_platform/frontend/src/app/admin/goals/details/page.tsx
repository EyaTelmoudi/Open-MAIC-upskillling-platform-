import { GoalsContent } from "@/app/goals/page";
import { AdminShell } from "@/app/components/layout/AdminShell";

export default function AdminGoalDetailsPage() {
  return (
    <AdminShell>
      <GoalsContent workspace="admin" view="details" />
    </AdminShell>
  );
}
