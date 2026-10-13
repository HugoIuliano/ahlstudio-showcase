import type { MetadataRoute } from "next";

/** Web App Manifest — instalável em Android (Chrome/Edge/Samsung), iOS (Adicionar à Tela de Início) e desktop. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "AHL Studio — Impressão 3D personalizada",
    short_name: "AHL Studio",
    description: "Bonecos estilo Funko de pets e pessoas, chaveiros personalizados e peças com NFC para o seu negócio. Americana/SP.",
    lang: "pt-BR",
    dir: "ltr",
    start_url: "/?source=pwa",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    orientation: "portrait",
    background_color: "#F7EDF0",
    theme_color: "#F4AFAB",
    categories: ["shopping", "lifestyle"],
    icons: [
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/brand/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Catálogo", short_name: "Catálogo", url: "/produtos?source=pwa", icons: [{ src: "/brand/icon-192.png", sizes: "192x192" }] },
      { name: "Pedir personalizado", short_name: "Personalizado", url: "/projetos?source=pwa", icons: [{ src: "/brand/icon-192.png", sizes: "192x192" }] },
      { name: "Minha conta", short_name: "Conta", url: "/conta?source=pwa", icons: [{ src: "/brand/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
