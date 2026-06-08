import { CustomBadgeManagementPage } from "@/app/components/admin/CustomBadgeManagementPage";
import { AdminShell } from "@/app/components/layout/AdminShell";

export default function AdminBadgesPage() {
  return (
    <AdminShell showPageHeader={false}>
      <CustomBadgeManagementPage mode="admin" />
    </AdminShell>
  );
}
