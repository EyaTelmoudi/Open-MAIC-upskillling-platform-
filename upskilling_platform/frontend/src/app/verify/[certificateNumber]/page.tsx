import {
  AlertTriangle,
  Award,
  Ban,
  Calendar,
  CheckCircle2,
  Hash,
  ShieldCheck,
  XCircle,
} from "lucide-react";

import type { CertificateVerifyResponse } from "@/app/lib/api";

const GATEWAY_URL = process.env.NEXT_PUBLIC_GATEWAY_URL || "http://localhost:8000";

async function verifyCertificate(
  certificateId: string
): Promise<CertificateVerifyResponse | null> {
  const res = await fetch(
    `${GATEWAY_URL}/api/v1/learning/verify/${certificateId}?format=json`,
    {
      headers: {
        Accept: "application/json",
      },
      cache: "no-store",
    }
  );

  if (!res.ok) {
    return null;
  }

  return res.json();
}

const statusUi = {
  valid: {
    title: "Certificate Valid",
    description: "This certificate passed database, status, and signature checks.",
    icon: CheckCircle2,
    badge: "Verified",
    accent: "from-emerald-500 to-cyan-500",
    heroTint: "bg-emerald-500/8",
    border: "border-emerald-500/25",
    iconColor: "text-emerald-600",
    panelTint: "bg-emerald-500/10 text-emerald-950",
    softCard: "border-emerald-500/20 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(240,253,250,0.92))]",
    detailTone: "text-emerald-900",
    titleTone: "text-emerald-950",
    courseTone: "text-emerald-800",
  },
  revoked: {
    title: "Certificate Revoked",
    description: "This certificate was issued previously but is no longer valid.",
    icon: Ban,
    badge: "Revoked",
    accent: "from-amber-500 to-orange-500",
    heroTint: "bg-amber-500/8",
    border: "border-amber-500/25",
    iconColor: "text-amber-600",
    panelTint: "bg-amber-500/10 text-amber-950",
    softCard: "border-amber-500/20 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(255,251,235,0.92))]",
    detailTone: "text-amber-900",
    titleTone: "text-amber-950",
    courseTone: "text-amber-800",
  },
  expired: {
    title: "Certificate Expired",
    description: "This certificate exists, but its validity period has ended.",
    icon: AlertTriangle,
    badge: "Expired",
    accent: "from-sky-500 to-indigo-500",
    heroTint: "bg-sky-500/8",
    border: "border-sky-500/25",
    iconColor: "text-sky-600",
    panelTint: "bg-sky-500/10 text-sky-950",
    softCard: "border-sky-500/20 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(239,246,255,0.92))]",
    detailTone: "text-sky-900",
    titleTone: "text-sky-950",
    courseTone: "text-sky-800",
  },
  invalid: {
    title: "Certificate Invalid",
    description: "The certificate could not be validated.",
    icon: XCircle,
    badge: "Invalid",
    accent: "from-rose-500 to-red-500",
    heroTint: "bg-rose-500/8",
    border: "border-red-500/25",
    iconColor: "text-red-600",
    panelTint: "bg-rose-500/10 text-rose-950",
    softCard: "border-rose-500/20 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(255,241,242,0.92))]",
    detailTone: "text-rose-900",
    titleTone: "text-rose-950",
    courseTone: "text-rose-800",
  },
} as const;

function formatDate(dateStr?: string | null) {
  if (!dateStr) return "N/A";
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default async function VerifyCertificatePage({
  params,
}: {
  params: Promise<{ certificateNumber: string }>;
}) {
  const { certificateNumber } = await params;
  const result = await verifyCertificate(certificateNumber);

  const resolvedResult =
    result ??
    ({
      status: "invalid",
      message: "Certificate not found",
    } satisfies CertificateVerifyResponse);

  const ui =
    statusUi[
      (resolvedResult.status in statusUi
        ? resolvedResult.status
        : "invalid") as keyof typeof statusUi
    ];
  const StatusIcon = ui.icon;

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(15,159,119,0.12),transparent_22%),radial-gradient(circle_at_top_right,rgba(14,165,164,0.1),transparent_20%),linear-gradient(180deg,#fbfdff_0%,#f4f8fc_46%,#edf3fa_100%)] px-4 py-12">
      <div className="mx-auto max-w-3xl">
        <div className={`overflow-hidden rounded-[32px] border ${ui.border} bg-[linear-gradient(180deg,rgba(255,255,255,0.96)_0%,rgba(245,250,252,0.94)_100%)] shadow-[0_30px_80px_rgba(148,163,184,0.22)] backdrop-blur-md`}>
          <div className={`border-b ${ui.border} bg-[linear-gradient(180deg,rgba(255,255,255,0.97)_0%,rgba(248,251,255,0.92)_100%)] px-6 py-8 text-center`}>
            <div className={`mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-white/60 bg-gradient-to-br ${ui.accent} shadow-[0_20px_45px_rgba(15,23,42,0.16)]`}>
              <StatusIcon className="h-10 w-10 text-white" />
            </div>
            <p className="mt-4 text-xs font-semibold uppercase tracking-[0.35em] text-slate-600">
              {ui.badge}
            </p>
            <h1 className={`mt-2 text-3xl font-bold ${ui.titleTone}`}>{ui.title}</h1>
            <p className="mt-2 text-sm text-slate-700">{ui.description}</p>
          </div>

          <div className="space-y-8 p-6 sm:p-8">
            <div className={`rounded-2xl border ${ui.border} ${ui.panelTint} p-5`}>
              <p className="text-sm font-medium">{resolvedResult.message}</p>
              {resolvedResult.reason ? (
                <p className="mt-3 text-sm font-medium text-amber-700">
                  Reason: {resolvedResult.reason}
                </p>
              ) : null}
            </div>

            {(resolvedResult.full_name || resolvedResult.course_name) && (
              <>
                <div className={`flex items-center justify-center gap-3 rounded-3xl border ${ui.border} ${ui.heroTint} px-5 py-5 text-center`}>
                  <Award className="h-10 w-10 text-gold" />
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-700">
                      Certificate of Completion
                    </p>
                    <p className="mt-1 text-sm font-medium text-slate-800">
                      Signed with RS256 and verified against the issued record
                    </p>
                  </div>
                </div>

                <div className="text-center">
                  <p className="text-sm font-semibold text-slate-700">Learner</p>
                  <h2 className="mt-2 text-3xl font-bold text-slate-950">
                    {resolvedResult.full_name}
                  </h2>
                </div>

                <div className="text-center">
                  <p className="text-sm font-semibold text-slate-700">Completed course</p>
                  <h3 className={`mt-2 text-xl font-semibold ${ui.courseTone}`}>
                    {resolvedResult.course_name}
                  </h3>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <div className={`rounded-2xl border ${ui.softCard} p-4 shadow-sm`}>
                    <div className="mb-2 flex items-center gap-2 text-slate-700">
                      <Calendar className="h-4 w-4" />
                      <span className="text-xs uppercase tracking-[0.2em]">
                        Completion
                      </span>
                    </div>
                    <p className={`text-sm font-medium ${ui.detailTone}`}>
                      {formatDate(resolvedResult.completion_date)}
                    </p>
                  </div>
                  <div className={`rounded-2xl border ${ui.softCard} p-4 shadow-sm`}>
                    <div className="mb-2 flex items-center gap-2 text-slate-700">
                      <ShieldCheck className="h-4 w-4" />
                      <span className="text-xs uppercase tracking-[0.2em]">
                        Issued
                      </span>
                    </div>
                    <p className={`text-sm font-medium ${ui.detailTone}`}>
                      {formatDate(resolvedResult.issued_at)}
                    </p>
                  </div>
                  <div className={`rounded-2xl border ${ui.softCard} p-4 shadow-sm`}>
                    <div className="mb-2 flex items-center gap-2 text-slate-700">
                      <AlertTriangle className="h-4 w-4" />
                      <span className="text-xs uppercase tracking-[0.2em]">
                        Expires
                      </span>
                    </div>
                    <p className={`text-sm font-medium ${ui.detailTone}`}>
                      {formatDate(resolvedResult.expires_at)}
                    </p>
                  </div>
                  <div className={`rounded-2xl border ${ui.softCard} p-4 shadow-sm`}>
                    <div className="mb-2 flex items-center gap-2 text-slate-700">
                      <Hash className="h-4 w-4" />
                      <span className="text-xs uppercase tracking-[0.2em]">
                        Certificate ID
                      </span>
                    </div>
                    <p className="break-all font-mono text-xs font-medium text-slate-950">
                      {resolvedResult.certificate_id || certificateNumber}
                    </p>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
