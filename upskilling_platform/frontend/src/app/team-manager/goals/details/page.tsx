import { GoalsContent } from "@/app/goals/page";
import { TeamManagerShell } from "@/app/components/layout/TeamManagerShell";

export default function TeamManagerGoalDetailsPage() {
  return (
    <TeamManagerShell>
      <GoalsContent workspace="team-manager" view="details" />
    </TeamManagerShell>
  );
}
