import { GoalsContent } from "@/app/goals/page";
import { TeamManagerShell } from "@/app/components/layout/TeamManagerShell";

export default function TeamManagerCreatedGoalsPage() {
  return (
    <TeamManagerShell>
      <GoalsContent workspace="team-manager" view="created" />
    </TeamManagerShell>
  );
}
