import { redirect } from "next/navigation";
import { routes } from "@/app/lib/routes";

export default function AdminGoalsPage() {
  redirect(routes.adminGoalsCreated);
}
