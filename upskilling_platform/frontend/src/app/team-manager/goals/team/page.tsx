import { GoalsContent } from "@/app/goals/page";
import { TeamManagerShell } from "@/app/components/layout/TeamManagerShell";

export default function TeamManagerTeamGoalsPage() {
  return (
    <TeamManagerShell>
      <GoalsContent workspace="team-manager" view="team" />
    </TeamManagerShell>
  );
}
