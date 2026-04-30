import type { NextConfig } from 'next';

function resolveFrameAncestors(): string {
  const configured = process.env.ALLOWED_FRAME_ANCESTORS?.trim();
  const defaultDevAncestors =
    process.env.NODE_ENV === 'production'
      ? []
      : ['http://localhost:3001', 'http://127.0.0.1:3001'];

  const configuredAncestors = configured ? configured.split(/\s+/).filter(Boolean) : [];
  const merged = Array.from(new Set([...configuredAncestors, ...defaultDevAncestors]));

  return merged.length > 0 ? `'self' ${merged.join(' ')}` : "'self'";
}

const nextConfig: NextConfig = {
  output: process.env.VERCEL ? undefined : 'standalone',
  transpilePackages: ['mathml2omml', 'pptxgenjs'],
  serverExternalPackages: [],
  experimental: {
    proxyClientMaxBodySize: '200mb',
  },
  async headers() {
    const extraAncestors = process.env.ALLOWED_FRAME_ANCESTORS?.trim();
    const frameAncestors = resolveFrameAncestors();

    return [
      {
        source: '/(.*)',
        headers: [
          // X-Frame-Options only supports SAMEORIGIN (no allow-list),
          // so we omit it when custom ancestors are configured.
          ...(!extraAncestors ? [{ key: 'X-Frame-Options', value: 'SAMEORIGIN' }] : []),
          {
            key: 'Content-Security-Policy',
            value: `frame-ancestors ${frameAncestors}`,
          },
        ],
      },
    ];
  },
};

export default nextConfig;
