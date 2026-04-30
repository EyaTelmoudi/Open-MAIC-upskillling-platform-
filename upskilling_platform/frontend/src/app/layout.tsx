import type { Metadata } from "next";
import { AuthProvider } from "@/app/context/AuthContext";
import "./globals.css";

export const metadata: Metadata = {
  title: "SkillForge — Enterprise Learning Platform",
  description: "AI-driven upskilling and mentorship platform",
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
