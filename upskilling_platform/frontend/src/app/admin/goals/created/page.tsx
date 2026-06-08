import { GoalsContent } from "@/app/goals/page";
import { AdminShell } from "@/app/components/layout/AdminShell";

export default function AdminCreatedGoalsPage() {
  return (
    <AdminShell>
      <GoalsContent workspace="admin" view="created" />
    </AdminShell>
  );
}
