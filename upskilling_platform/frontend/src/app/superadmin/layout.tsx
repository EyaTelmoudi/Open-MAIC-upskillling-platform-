"use client";

import { usePathname } from "next/navigation";
import { SuperAdminShell } from "@/app/components/layout/SuperAdminShell";

export default function SuperAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  if (pathname === "/superadmin/login") {
    return <>{children}</>;
  }

  return <SuperAdminShell>{children}</SuperAdminShell>;
}
