import { CustomBadgeManagementPage } from "@/app/components/admin/CustomBadgeManagementPage";
import { TeamManagerShell } from "@/app/components/layout/TeamManagerShell";

export default function TeamManagerBadgesPage() {
  return (
    <TeamManagerShell showPageHeader={false}>
      <CustomBadgeManagementPage mode="team-manager" />
    </TeamManagerShell>
  );
}
