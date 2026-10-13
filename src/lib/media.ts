import type { MediaType, ProductImage } from "@/db/schema";

const VIDEO_RE = /\.(mp4|webm|mov|m4v)(\?.*)?$/i;

export function mediaTypeFromUrl(url: string): MediaType {
  return VIDEO_RE.test(url) ? "video" : "image";
}

/**
 * Linha do campo "mídias" do admin: `url` ou `url | poster`.
 * Ex.: https://cdn/x.mp4 | https://cdn/x-capa.jpg
 */
export function parseMediaLines(raw: string | null | undefined) {
  return (raw ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [url, poster] = line.split("|").map((p) => p.trim());
      return { url, posterUrl: poster || null, type: mediaTypeFromUrl(url) };
    })
    .filter((m) => /^https?:\/\//i.test(m.url));
}

export function mediaToLine(m: Pick<ProductImage, "url" | "posterUrl">) {
  return m.posterUrl ? `${m.url} | ${m.posterUrl}` : m.url;
}

/** Miniatura para cards/carrinho: primeira imagem, ou poster do primeiro vídeo. */
export function thumbUrl(images: Pick<ProductImage, "url" | "type" | "posterUrl">[]): string | null {
  const img = images.find((i) => i.type === "image");
  if (img) return img.url;
  const vid = images.find((i) => i.type === "video" && i.posterUrl);
  return vid?.posterUrl ?? null;
}
