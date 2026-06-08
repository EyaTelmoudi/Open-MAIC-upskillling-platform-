import { GoalsContent } from "@/app/goals/page";
import { AdminShell } from "@/app/components/layout/AdminShell";

export default function AdminPersonalGoalsPage() {
  return (
    <AdminShell>
      <GoalsContent workspace="admin" view="personal" />
    </AdminShell>
  );
}
