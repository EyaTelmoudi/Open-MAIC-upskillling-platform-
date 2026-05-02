import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  async rewrites() {
    const identityUrl =
      process.env.NEXT_PUBLIC_IDENTITY_URL || "http://localhost:8001";
    const agentsUrl =
      process.env.NEXT_PUBLIC_AGENTS_URL || "http://localhost:8003";
    const notificationsUrl =
      process.env.NEXT_PUBLIC_NOTIFICATIONS_URL || "http://localhost:8004";

    return [
      {
        source: "/api/v1/auth/:path*",
        destination: `${identityUrl}/api/v1/auth/:path*`,
      },
      {
        source: "/api/v1/identity/:path*",
        destination: `${identityUrl}/api/v1/identity/:path*`,
      },
      {
        source: "/api/v1/sync/:path*",
        destination: `${identityUrl}/api/v1/sync/:path*`,
      },
      {
        source: "/api/v1/superadmin/:path*",
        destination: `${identityUrl}/api/v1/superadmin/:path*`,
      },
      {
        source: "/api/v1/tenants/:path*",
        destination: `${identityUrl}/api/v1/tenants/:path*`,
      },
      {
        source: "/api/v1/onboarding/:path*",
        destination: `${identityUrl}/api/v1/onboarding/:path*`,
      },
      {
        source: "/setup",
        destination: `${identityUrl}/setup`,
      },
      {
        source: "/setup/:path*",
        destination: `${identityUrl}/setup/:path*`,
      },
      {
        source: "/api/v1/agents/:path*",
        destination: `${agentsUrl}/api/v1/:path*`,
      },
      {
        source: "/api/v1/notifications/:path*",
        destination: `${notificationsUrl}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
