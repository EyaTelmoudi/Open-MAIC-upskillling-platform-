"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Zap } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/app/components/ui/Card";
import { LoginForm } from "@/app/components/auth/LoginForm";
import { AzureLoginButton } from "@/app/components/auth/AzureLoginButton";

export default function LoginPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [selectedTenant, setSelectedTenant] = useState<string>("");

  useEffect(() => {
    const tenantParam = searchParams.get("tenant");
    if (tenantParam) {
      setSelectedTenant(tenantParam);
    }
  }, [searchParams]);

  const handleTenantChange = (slug: string) => {
    setSelectedTenant(slug);
    if (slug) {
      router.push(`/login?tenant=${slug}`);
    } else {
      router.push("/login");
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-10">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(15,159,119,0.12),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(14,165,164,0.10),transparent_24%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-56 bg-[linear-gradient(180deg,rgba(255,255,255,0.82),rgba(255,255,255,0))]" />

      <Card className="relative w-full max-w-md border-slate-200/90 bg-white/95 text-slate-900 shadow-[0_24px_60px_rgba(15,23,42,0.10)] backdrop-blur-sm">
        <CardHeader className="items-center border-b border-slate-200/80 pb-6 text-center">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#0f9f77_0%,#14b889_100%)] shadow-[0_14px_32px_rgba(15,159,119,0.25)]">
            <Zap className="h-6 w-6 text-white" />
          </div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-emerald-700/80">
            Enterprise Learning
          </p>
          <CardTitle className="mt-2 text-3xl tracking-tight text-slate-900">
            SkillForge
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-5 p-6">
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
              Company SSO
            </p>
            <AzureLoginButton tenant={selectedTenant} />
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-slate-200" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white px-3 font-medium tracking-[0.18em] text-slate-500">
                Or continue with
              </span>
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
              Local account
            </p>
            <LoginForm tenant={selectedTenant} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
