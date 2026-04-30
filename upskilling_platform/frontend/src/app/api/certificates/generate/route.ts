import { NextRequest, NextResponse } from "next/server";
import { jsPDF } from "jspdf";
import * as QRCode from "qrcode";

const GATEWAY_URL = process.env.NEXT_PUBLIC_GATEWAY_URL || "http://localhost:8000";
const FRONTEND_URL = process.env.NEXT_PUBLIC_FRONTEND_URL || "http://localhost:3000";

function getAuthToken(request: NextRequest): string | null {
  const authHeader = request.headers.get("authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.substring(7);
  }
  const cookieHeader = request.headers.get("cookie");
  if (cookieHeader) {
    const match = cookieHeader.match(/access_token=([^;]+)/);
    if (match) return match[1];
  }
  const tokenParam = request.nextUrl.searchParams.get("token");
  if (tokenParam) {
    return tokenParam;
  }
  return null;
}

async function fetchWithAuth(url: string, token: string) {
  const res = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    redirect: "follow",
  });
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const certificateId = searchParams.get("id");

  if (!certificateId) {
    return NextResponse.json(
      { error: "Certificate ID is required" },
      { status: 400 }
    );
  }

  const token = getAuthToken(request);
  if (!token) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 }
    );
  }

  try {
    const certificate = await fetchWithAuth(
      `${GATEWAY_URL}/api/v1/learning/certificates/${certificateId}`,
      token
    );

    const pdf = new jsPDF({
      orientation: "landscape",
      unit: "mm",
      format: "a4",
    });

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();

    // === BACKGROUND ===
    // Base color: #F9FAFB
    pdf.setFillColor(249, 250, 251);
    pdf.rect(0, 0, pageWidth, pageHeight, "F");
    
    // Subtle dot pattern (won't render perfectly in jsPDF but we add texture)
    pdf.setDrawColor(249, 250, 251);
    for (let x = 0; x < pageWidth; x += 8) {
      for (let y = 0; y < pageHeight; y += 8) {
        pdf.circle(x, y, 0.3, "F");
      }
    }

    // === BORDER SYSTEM ===
    // Outer border with gradient effect (simulated with multiple strokes)
    const primaryColor = [99, 102, 241]; // #6366F1
    const secondaryColor = [34, 211, 238]; // #22D3EE
    
    pdf.setDrawColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    pdf.setLineWidth(1);
    pdf.roundedRect(10, 10, pageWidth - 20, pageHeight - 20, 8, 8, "S");
    
    // Inner border
    pdf.setDrawColor(229, 231, 235); // #E5E7EB
    pdf.setLineWidth(0.5);
    pdf.roundedRect(20, 20, pageWidth - 40, pageHeight - 40, 6, 6, "S");

    // === TOP BADGE ===
    const badgeCenterX = pageWidth / 2;
    const badgeY = 45;
    const badgeRadius = 12;
    
    // Badge gradient effect (multiple circles)
    pdf.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    pdf.circle(badgeCenterX, badgeY, badgeRadius, "F");
    pdf.setFillColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
    pdf.circle(badgeCenterX, badgeY, badgeRadius - 3, "F");
    
    // Shield/check icon in badge
    pdf.setDrawColor(255, 255, 255);
    pdf.setLineWidth(1.5);
    pdf.line(badgeCenterX - 4, badgeY, badgeCenterX, badgeY - 4);
    pdf.line(badgeCenterX, badgeY - 4, badgeCenterX + 4, badgeY);
    pdf.line(badgeCenterX + 4, badgeY, badgeCenterX + 1, badgeY + 3);
    pdf.line(badgeCenterX + 1, badgeY + 3, badgeCenterX - 1, badgeY + 3);
    pdf.line(badgeCenterX - 1, badgeY + 3, badgeCenterX - 4, badgeY);

    // === TYPOGRAPHY ===
    // Title: CERTIFICATE
    pdf.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    pdf.setFontSize(36);
    pdf.setFont("helvetica", "bold");
    pdf.text("CERTIFICATE", pageWidth / 2, 75, { align: "center" });
    
    // Subtitle: OF COMPLETION
    pdf.setTextColor(107, 114, 128); // #6B7280
    pdf.setFontSize(12);
    pdf.setFont("helvetica", "normal");
    pdf.text("OF COMPLETION", pageWidth / 2, 82, { align: "center" });
    
    // Platform Name
    pdf.setTextColor(55, 65, 81); // #374151
    pdf.setFontSize(14);
    pdf.text("SkillForge Learning Platform", pageWidth / 2, 90, { align: "center" });

    // === RECIPIENT NAME ===
    pdf.setTextColor(17, 24, 39); // #111827
    pdf.setFontSize(28);
    pdf.setFont("helvetica", "bold");
    pdf.text(certificate.learner_name, pageWidth / 2, 110, { align: "center" });
    
    // Thin gradient underline
    pdf.setDrawColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    pdf.setLineWidth(0.5);
    pdf.line(pageWidth / 2 - 40, 114, pageWidth / 2 + 40, 114);
    pdf.setDrawColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
    pdf.line(pageWidth / 2 - 40, 114, pageWidth / 2 + 40, 114);

    // "has successfully completed"
    pdf.setTextColor(107, 114, 128);
    pdf.setFontSize(14);
    pdf.setFont("helvetica", "normal");
    pdf.text("has successfully completed", pageWidth / 2, 125, { align: "center" });

    // Course Title
    pdf.setTextColor(31, 41, 55); // #1F2937
    pdf.setFontSize(20);
    pdf.setFont("helvetica", "bold");
    pdf.text(certificate.course_title, pageWidth / 2, 138, { align: "center" });

    // === ISSUE DATE ===
    const issuedDate = new Date(certificate.issued_at).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    pdf.setFontSize(10);
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(107, 114, 128);
    pdf.text(`Issue Date: ${issuedDate}`, 26, pageHeight - 34);
    pdf.text(`Certificate No: ${certificate.certificate_number}`, 26, pageHeight - 28);

    // === CENTRAL SEAL (Bottom) ===
    const sealX = pageWidth / 2;
    const sealY = pageHeight - 36;
    const sealRadius = 11;
    
    // Outer ring
    pdf.setDrawColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    pdf.setLineWidth(1);
    pdf.circle(sealX, sealY, sealRadius, "S");
    
    // Inner ring
    pdf.setDrawColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
    pdf.setLineWidth(0.5);
    pdf.circle(sealX, sealY, sealRadius - 5, "S");
    
    // Shield in seal
    pdf.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    pdf.circle(sealX, sealY, 5, "F");

    // === SIGNATURE SECTION ===
    const sigLeftX = 38;
    const sigRightX = pageWidth - 112;
    const sigY = pageHeight - 50;
    
    // Left: Signature (name and title)
    pdf.setTextColor(17, 24, 39);
    pdf.setFontSize(12);
    pdf.setFont("courier", "normal"); // Script-ish font
    pdf.text("Dr. Emily Watson", sigLeftX, sigY);
    pdf.setTextColor(107, 114, 128);
    pdf.setFontSize(8);
    pdf.setFont("helvetica", "normal");
    pdf.text("Chief Learning Officer", sigLeftX, sigY + 5);
    
    // Right: Date of Completion
    pdf.setTextColor(17, 24, 39);
    pdf.setFontSize(10);
    pdf.text(issuedDate, sigRightX, sigY);
    pdf.setTextColor(107, 114, 128);
    pdf.setFontSize(8);
    pdf.text("Date of Completion", sigRightX, sigY + 5);

    // === VERIFICATION SECTION ===
    const verifyUrl = `${FRONTEND_URL}/verify/${certificate.id}`;
    const verificationTextX = pageWidth - 114;
    const verificationTextY = pageHeight - 32;

    pdf.setTextColor(107, 114, 128);
    pdf.setFontSize(7);
    pdf.text("Verify this certificate", verificationTextX, verificationTextY);
    pdf.text("by scanning the QR code", verificationTextX, verificationTextY + 4);
    pdf.text(`Signature: ${certificate.signature_algorithm || "RS256"}`, verificationTextX, verificationTextY + 10);

    const finalQrDataUrl = await QRCode.toDataURL(verifyUrl, {
      width: 200,
      margin: 1,
      errorCorrectionLevel: "H",
      color: {
        dark: "#111827",
        light: "#FFFFFF",
      },
    });

    pdf.addImage(finalQrDataUrl, "PNG", pageWidth - 48, pageHeight - 50, 24, 24);

    const pdfBuffer = pdf.output("arraybuffer");

    return new NextResponse(Buffer.from(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="certificate-${certificate.id}.pdf"`,
      },
    });
  } catch (error) {
    console.error("Error generating certificate PDF:", error);
    console.error("Certificate ID:", certificateId);
    console.error("Error details:", error instanceof Error ? error.message : String(error));
    return NextResponse.json(
      { error: "Failed to generate PDF", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
