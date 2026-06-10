"use client";

import { useEffect, useState } from "react";
import { Award, Download, ExternalLink, Calendar, Hash, X, Eye } from "lucide-react";
import { getCertificates, type CertificateResponse } from "@/app/lib/api";
import { AppShell } from "@/app/components/layout/AppShell";
import { Button } from "@/app/components/ui/Button";
import { Card } from "@/app/components/ui/Card";
import { Badge } from "@/app/components/ui/Badge";
import Link from "next/link";
import { useAuth } from "@/app/context/AuthContext";
import { formatDateOnlyForUser } from "@/app/lib/user-date-format";

export default function CertificatesPage() {
  const { user } = useAuth();
  const [certificates, setCertificates] = useState<CertificateResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [previewCert, setPreviewCert] = useState<CertificateResponse | null>(null);

  useEffect(() => {
    loadCertificates();
  }, []);

  const loadCertificates = async () => {
    try {
      const data = await getCertificates();
      setCertificates(data.certificates);
    } catch (err) {
      setError("Failed to load certificates");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const downloadPdf = (certificateId: string) => {
    const token = localStorage.getItem("access_token");
    const url = `/api/certificates/generate?id=${certificateId}${token ? `&token=${token}` : ""}`;
    const link = document.createElement("a");
    link.href = url;
    link.download = `certificate-${certificateId}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getLinkedInShareUrl = (cert: CertificateResponse) => {
    const certUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/verify/${cert.id}`;
    return `https://www.linkedin.com/profile/add?startTask=CERTIFICATION_NAME&name=${encodeURIComponent(cert.course_title)}&organizationName=${encodeURIComponent(cert.issuing_org || "SkillForge")}&issueYear=${new Date(cert.issued_at).getFullYear()}&issueMonth=${new Date(cert.issued_at).getMonth() + 1}&certUrl=${encodeURIComponent(certUrl)}&certId=${cert.certificate_number}`;
  };

  const formatDate = (dateStr: string) => {
    return formatDateOnlyForUser(dateStr, user?.timezone);
  };

  if (loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center h-full">
          <div className="text-white">Loading certificates...</div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <Award className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-text-primary">My Certificates</h1>
              <p className="text-sm text-text-secondary">
                Review, preview, and share the credentials you earned on the platform
              </p>
            </div>
          </div>
          <Badge variant="outline" className="hidden sm:inline-flex">
            {certificates.length} earned
          </Badge>
        </div>

        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {certificates.length === 0 ? (
          <Card className="p-12 text-center">
            <Award className="mx-auto mb-4 h-16 w-16 text-primary/30" />
            <h2 className="mb-2 text-xl font-semibold text-text-primary">No certificates yet</h2>
            <p className="mb-6 text-text-secondary">
              Complete published courses to unlock verifiable completion certificates.
            </p>
            <Link href="/courses">
              <Button>Browse Courses</Button>
            </Link>
          </Card>
        ) : (
          <>
            <div className="grid gap-4">
              {certificates.map((cert) => (
                <Card
                  key={cert.id}
                  className="cursor-pointer border-border/80 p-6 transition-colors hover:border-primary/30"
                  onClick={() => setPreviewCert(cert)}
                >
                  <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="mb-3 flex flex-wrap items-center gap-2">
                        <Badge className="bg-gold/10 text-gold hover:bg-gold/10">
                          Certificate of Completion
                        </Badge>
                        <Badge variant="outline">{cert.status}</Badge>
                        {cert.issuing_org ? (
                          <Badge variant="outline">{cert.issuing_org}</Badge>
                        ) : null}
                      </div>
                      <h3 className="text-xl font-semibold text-text-primary">
                        {cert.course_title}
                      </h3>
                      <div className="mt-4 flex flex-col gap-3 text-sm text-text-secondary sm:flex-row sm:flex-wrap sm:items-center sm:gap-6">
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4" />
                          <span>Issued: {formatDate(cert.issued_at)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Hash className="h-4 w-4" />
                          <span className="font-mono">{cert.certificate_number}</span>
                        </div>
                      </div>
                    </div>
                    <div
                      className="flex flex-wrap items-center gap-2"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Button variant="outline" onClick={() => setPreviewCert(cert)}>
                        <Eye className="h-4 w-4" />
                        Preview
                      </Button>
                      <Button onClick={() => downloadPdf(cert.id)}>
                        <Download className="h-4 w-4" />
                        Download
                      </Button>
                      <a
                        href={getLinkedInShareUrl(cert)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 rounded-xl bg-[#0077B5] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#006097]"
                      >
                        <ExternalLink className="h-4 w-4" />
                        LinkedIn
                      </a>
                    </div>
                  </div>
                  {cert.issuing_org && (
                    <div className="mt-4 border-t border-border pt-4">
                      <span className="text-sm text-text-secondary">
                        Issued by: {cert.issuing_org}
                      </span>
                    </div>
                  )}
                </Card>
              ))}
            </div>
          </>
        )}

        {previewCert && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
            <div className="relative max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-2xl border border-border bg-card">
              <div className="flex items-center justify-between border-b border-border p-4">
                <div>
                  <h3 className="text-lg font-semibold text-text-primary">Certificate Preview</h3>
                  <div className="mt-1 inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-300">
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 12l2 2 4-4" />
                      <path d="M12 3l7 4v5c0 5-3.5 7.5-7 9-3.5-1.5-7-4-7-9V7l7-4z" />
                    </svg>
                    <span>Verified by QR</span>
                  </div>
                </div>
                <button
                  onClick={() => setPreviewCert(null)}
                  className="rounded-lg p-2 text-text-secondary transition-colors hover:bg-background hover:text-text-primary"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="max-h-[calc(90vh-80px)] overflow-auto p-6">
                <div className="overflow-hidden rounded-xl bg-white shadow-2xl" style={{ aspectRatio: "297/210", maxHeight: "520px" }}>
                  <div className="relative h-full w-full bg-[#FAFAFA] p-2">
                    <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-[#6366F1] to-[#22D3EE]"></div>
                    <div className="absolute inset-[3px] rounded-lg bg-gradient-to-r from-[#6366F1] to-[#22D3EE]"></div>
                    <div className="absolute inset-[6px] rounded bg-[#FAFAFA]"></div>
                    <div className="absolute inset-[8px] rounded border border-[#E5E7EB]"></div>
                    <div className="relative flex h-full flex-col items-center justify-between px-8 py-4">
                      <div className="text-center">
                        <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-[#6366F1] to-[#22D3EE] shadow-lg">
                          <svg className="h-7 w-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                          </svg>
                        </div>
                        <h1 className="text-2xl font-serif font-bold tracking-[3px] text-[#6366F1]">
                          CERTIFICATE
                        </h1>
                        <p className="mt-0.5 text-xs tracking-[2px] text-gray-500">OF COMPLETION</p>
                        <p className="mt-1 text-sm text-gray-600">SkillForge Learning Platform</p>
                      </div>

                      <div className="text-center">
                        <p className="text-xs text-gray-500">This is to certify that</p>
                        <h2 className="mt-1 text-xl font-bold text-gray-900">{previewCert.learner_name}</h2>
                        <div className="mx-auto mt-1 h-0.5 w-24 bg-gradient-to-r from-[#6366F1] to-[#22D3EE]"></div>
                        <p className="mt-2 text-xs text-gray-500">has successfully completed</p>
                        <h3 className="mt-1 text-base font-semibold text-gray-800">{previewCert.course_title}</h3>
                      </div>

                      <div className="flex w-full items-end justify-between">
                        <div className="text-center">
                          <p className="mb-0.5 border-b border-gray-400 pb-0.5 text-sm font-serif italic text-gray-900">Dr. Emily Watson</p>
                          <p className="text-[10px] uppercase tracking-wide text-gray-500">Chief Learning Officer</p>
                        </div>
                        <div className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-[#6366F1]">
                          <div className="flex h-9 w-9 items-center justify-center rounded-full border border-[#22D3EE]">
                            <div className="h-3 w-3 rounded-full bg-[#6366F1]"></div>
                          </div>
                        </div>
                        <div className="text-center">
                          <p className="mb-0.5 border-b border-gray-400 pb-0.5 text-sm text-gray-900">{formatDate(previewCert.issued_at)}</p>
                          <p className="text-[10px] uppercase tracking-wide text-gray-500">Date of Completion</p>
                        </div>
                      </div>
                      <div className="flex w-full items-center justify-between border-t border-gray-200 pt-2">
                        <div className="flex items-center gap-1.5">
                          <svg className="h-3 w-3 text-[#6366F1]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                          </svg>
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-[#6366F1]">Verified</span>
                        </div>
                        <span className="font-mono text-[10px] text-gray-500">{previewCert.id}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-end gap-3 border-t border-border p-4">
                <Button variant="ghost" onClick={() => setPreviewCert(null)}>
                  Close
                </Button>
                <Button onClick={() => downloadPdf(previewCert.id)}>
                  <Download className="h-4 w-4" />
                  Download PDF
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
