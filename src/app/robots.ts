import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  const url = siteUrl();
  return {
    rules: [
      // páginas pessoais/transacionais e o backoffice ficam fora do índice
      { userAgent: "*", allow: "/", disallow: ["/admin", "/conta", "/checkout", "/carrinho", "/pedido/", "/orcamento/", "/ajuda/chamados/", "/api/", "/login", "/cadastro"] },
    ],
    sitemap: `${url}/sitemap.xml`,
    host: url,
  };
}
