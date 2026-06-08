import { GoalsContent } from "@/app/goals/page";
import { AdminShell } from "@/app/components/layout/AdminShell";

export default function AdminTeamGoalsPage() {
  return (
    <AdminShell>
      <GoalsContent workspace="admin" view="team" />
    </AdminShell>
  );
}
