import type { Settings } from "./settings";

/** URL pública da loja (canônica). Em produção vem de NEXT_PUBLIC_APP_URL; sem ela, cai no domínio do Cloud Run. */
export function siteUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL || process.env.AUTH_URL || "https://ahlstudio-450714791922.us-east4.run.app").replace(/\/$/, "");
}

export const SITE_NAME = "AHL Studio";
export const DEFAULT_DESCRIPTION =
  "Estúdio de impressão 3D em Americana/SP: bonecos estilo Funko de pets e pessoas, chaveiros personalizados e peças com NFC para comércios. Orçamento em até 2 dias úteis, entrega local e envio para todo o Brasil.";

/** Serializa JSON-LD com segurança (escapa `<` para não fechar a tag script). */
export function jsonLd(data: unknown) {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

/** Organization + LocalBusiness (Schema.org) a partir das configurações da loja. */
export function organizationLd(s: Settings) {
  const url = siteUrl();
  const phone = s.shop_whatsapp ? `+${s.shop_whatsapp.replace(/\D/g, "")}` : undefined;
  return {
    "@context": "https://schema.org",
    "@type": ["Organization", "LocalBusiness"],
    "@id": `${url}/#org`,
    name: s.shop_name || SITE_NAME,
    legalName: s.shop_legal_name || undefined,
    url,
    logo: `${url}/brand/logo-icon-512.png`,
    image: `${url}/opengraph-image.png`,
    description: s.shop_tagline || DEFAULT_DESCRIPTION,
    email: s.shop_email || undefined,
    telephone: phone,
    address: { "@type": "PostalAddress", addressLocality: s.shop_city || "Americana", addressRegion: s.shop_state || "SP", addressCountry: "BR", streetAddress: s.shop_address || undefined },
    areaServed: [
      { "@type": "City", name: "Americana" },
      { "@type": "City", name: "Santa Bárbara d'Oeste" },
      { "@type": "City", name: "Nova Odessa" },
      { "@type": "City", name: "Sumaré" },
      { "@type": "City", name: "Hortolândia" },
      { "@type": "City", name: "Limeira" },
      { "@type": "City", name: "Paulínia" },
      { "@type": "Country", name: "Brasil" },
    ],
    sameAs: s.shop_instagram ? [`https://www.instagram.com/${s.shop_instagram.replace(/^@/, "")}`] : undefined,
    priceRange: "R$ 40 – R$ 300",
    knowsAbout: ["impressão 3D", "PLA", "bonecos personalizados estilo Funko", "miniaturas de pets", "chaveiros personalizados", "tags NFC para comércio", "presentes personalizados"],
    makesOffer: [
      { "@type": "Offer", itemOffered: { "@type": "Service", name: "Boneco personalizado de pet ou pessoa (estilo Funko) impresso em 3D" } },
      { "@type": "Offer", itemOffered: { "@type": "Service", name: "Chaveiros personalizados em 3D" } },
      { "@type": "Offer", itemOffered: { "@type": "Service", name: "Peças com NFC e QR Code para comércios (avaliação Google, cardápio, cartão de visita)" } },
      { "@type": "Offer", itemOffered: { "@type": "Service", name: "Impressão 3D sob demanda a partir de arquivo ou ideia" } },
    ],
  };
}

export function websiteLd() {
  const url = siteUrl();
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${url}/#website`,
    url,
    name: SITE_NAME,
    inLanguage: "pt-BR",
    publisher: { "@id": `${url}/#org` },
    potentialAction: { "@type": "SearchAction", target: { "@type": "EntryPoint", urlTemplate: `${url}/produtos?q={search_term_string}` }, "query-input": "required name=search_term_string" },
  };
}

export function breadcrumbLd(items: { name: string; path: string }[]) {
  const url = siteUrl();
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: `${url}${it.path}` })),
  };
}

export function faqLd(faq: { q: string; a: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  };
}
