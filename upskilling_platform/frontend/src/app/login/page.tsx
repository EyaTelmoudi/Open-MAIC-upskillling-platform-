import { Suspense } from "react";
import LoginPage from "@/app/pages/login/page";

export default function Login() {
  return (
    <Suspense fallback={null}>
      <LoginPage />
    </Suspense>
  );
}
