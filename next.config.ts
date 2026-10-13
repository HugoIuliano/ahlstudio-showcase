import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cloud Run / Docker: gera .next/standalone com server.js mínimo
  output: "standalone",
  images: {
    // Imagens de produto são URLs externas (admin cola o link) — sem storage pago
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
  serverExternalPackages: ["@libsql/client"],
  poweredByHeader: false,
  // anexos de orçamentos/chamados via server action (até ~4 arquivos de 5MB por envio)
  experimental: { serverActions: { bodySizeLimit: "24mb" } },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(self)" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          // CSP: scripts só do próprio domínio (Next precisa de inline para hidratação); imagens de produto são URLs externas https;
          // form-action inclui o Mercado Pago porque o redirect pós-checkout sai de um submit de formulário.
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              // dev: React precisa de eval para os stacks do overlay; em produção fica só inline (hidratação do Next)
              `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV !== "production" ? " 'unsafe-eval'" : ""}`,
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https:",
              "media-src 'self' blob: https:",
              "font-src 'self' data:",
              "connect-src 'self'",
              "worker-src 'self'",
              "manifest-src 'self'",
              "frame-src 'none'",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self' https://www.mercadopago.com.br https://www.mercadopago.com https://*.mercadopago.com.br https://*.mercadopago.com https://*.mercadolivre.com https://*.mercadolibre.com",
              "frame-ancestors 'self'",
              "upgrade-insecure-requests",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
