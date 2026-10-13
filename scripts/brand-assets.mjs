// Recorta a prancheta de marca (JPEG com fundo "xadrez" falso) em ativos PNG transparentes.
// Uso: node scripts/brand-assets.mjs <prancheta.jpg>
// O fundo é removido por flood-fill a partir das bordas (pixels claros e sem saturação),
// então as letras claras dentro da nuvem ficam intactas.
import sharp from "sharp";
import { mkdir } from "node:fs/promises";

const src = process.argv[2];
if (!src) throw new Error("informe o caminho da prancheta");
const OUT = "public/brand";
await mkdir(OUT, { recursive: true });
await mkdir("src/app", { recursive: true });

// regiões na prancheta 1408×768
const R = {
  icon: { left: 150, top: 70, width: 410, height: 410 }, // ícone colorido grande (do "Original")
  full: { left: 70, top: 70, width: 580, height: 590 }, // ícone + wordmark
  wordmark: { left: 70, top: 495, width: 580, height: 160 },
  flat: { left: 942, top: 96, width: 194, height: 196 },
  white: { left: 1162, top: 96, width: 196, height: 194 },
  filament: { left: 755, top: 445, width: 260, height: 240 },
  brain: { left: 1085, top: 445, width: 290, height: 250 },
};

// croma absoluto (max-min) em vez de saturação HSL: perto do branco a saturação explode com ruído de JPEG
function tone(r, g, b) {
  const max = Math.max(r, g, b) / 255, min = Math.min(r, g, b) / 255;
  return { c: max - min, l: (max + min) / 2 };
}

/** Remove o fundo. mode "light": flood-fill do xadrez claro a partir das bordas; mode "dark": tudo que é escuro vira transparente (silhueta branca). */
async function cutout(region, mode, opts = {}) {
  const { data, info } = await sharp(src).extract(region).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  if (mode === "dark") {
    const rgb = Buffer.alloc(w * h * 3, 255);
    const alpha = Buffer.alloc(w * h);
    for (let i = 0; i < w * h; i++) {
      const { l } = tone(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
      alpha[i] = Math.round(Math.max(0, Math.min(1, (l - 0.2) / 0.45)) * 255);
    }
    const buf = await sharp(rgb, { raw: { width: w, height: h, channels: 3 } }).joinChannel(alpha, { raw: { width: w, height: h, channels: 1 } }).png().toBuffer();
    return sharp(buf).trim({ threshold: 1 });
  }
  const isBg = (i) => {
    const { c, l } = tone(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
    return c < (opts.chroma ?? 0.07) && l > (opts.light ?? 0.7);
  };
  const seen = new Uint8Array(w * h);
  const stack = [];
  for (let x = 0; x < w; x++) { stack.push(x, (h - 1) * w + x); }
  for (let y = 0; y < h; y++) { stack.push(y * w, y * w + w - 1); }
  while (stack.length) {
    const i = stack.pop();
    if (seen[i] || !isBg(i)) continue;
    seen[i] = 1;
    const x = i % w, y = (i - x) / w;
    if (x > 0) stack.push(i - 1);
    if (x < w - 1) stack.push(i + 1);
    if (y > 0) stack.push(i - w);
    if (y < h - 1) stack.push(i + w);
  }
  // alpha: fundo → 0; borda do desenho recebe alpha parcial pela distância ao fundo (suaviza o recorte)
  const alpha = Buffer.alloc(w * h, 255);
  for (let i = 0; i < w * h; i++) if (seen[i]) alpha[i] = 0;
  for (let i = 0; i < w * h; i++) {
    if (seen[i]) continue;
    const x = i % w, y = (i - x) / w;
    let bg = 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && nx < w && ny >= 0 && ny < h && seen[ny * w + nx]) bg++;
    }
    if (bg) alpha[i] = Math.max(90, 255 - bg * 45);
  }
  const rgb = Buffer.alloc(w * h * 3);
  for (let i = 0; i < w * h; i++) {
    rgb[i * 3] = data[i * 4]; rgb[i * 3 + 1] = data[i * 4 + 1]; rgb[i * 3 + 2] = data[i * 4 + 2];
  }
  let img = sharp(rgb, { raw: { width: w, height: h, channels: 3 } }).joinChannel(alpha, { raw: { width: w, height: h, channels: 1 } }).png();
  const buf = await img.toBuffer();
  return sharp(buf).trim({ threshold: 1 }); // corta as margens transparentes
}

/** Quadrado com margem transparente (para ícones). */
async function squared(pipeline, size, pad = 0.1) {
  const buf = await pipeline.png().toBuffer();
  const inner = Math.round(size * (1 - pad * 2));
  const resized = await sharp(buf).resize(inner, inner, { fit: "inside", withoutEnlargement: false }).png().toBuffer();
  const meta = await sharp(resized).metadata();
  return sharp({ create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: resized, left: Math.round((size - meta.width) / 2), top: Math.round((size - meta.height) / 2) }])
    .png();
}

const icon = await cutout(R.icon, "light");
await icon.clone().toFile(`${OUT}/logo-icon.png`);
await (await squared(icon.clone(), 512, 0.06)).toFile(`${OUT}/logo-icon-512.png`);
await (await squared(icon.clone(), 512, 0.08)).toFile("src/app/icon.png"); // favicon (Next gera <link rel=icon>)
await (await squared(icon.clone(), 180, 0.1)).flatten({ background: "#F7EDF0" }).toFile("src/app/apple-icon.png"); // iOS não usa transparência
await (await squared(icon.clone(), 192, 0.08)).toFile(`${OUT}/icon-192.png`);
await (await squared(icon.clone(), 512, 0.08)).toFile(`${OUT}/icon-512.png`);
await (await squared(icon.clone(), 512, 0.16)).flatten({ background: "#F7EDF0" }).toFile(`${OUT}/icon-512-maskable.png`);

await (await cutout(R.full, "light")).toFile(`${OUT}/logo-full.png`);
await (await cutout(R.wordmark, "light")).toFile(`${OUT}/logo-wordmark.png`);
await (await cutout(R.flat, "light")).toFile(`${OUT}/logo-icon-flat.png`);
await (await cutout(R.white, "dark")).toFile(`${OUT}/logo-icon-white.png`);
await (await cutout(R.filament, "light")).toFile(`${OUT}/filament.png`);
await (await cutout(R.brain, "light")).toFile(`${OUT}/brain.png`);

// Open Graph 1200×630: fundo blush + logo completo
const full = await sharp(`${OUT}/logo-full.png`).resize({ height: 460, fit: "inside" }).png().toBuffer();
const fm = await sharp(full).metadata();
await sharp({ create: { width: 1200, height: 630, channels: 4, background: "#F7EDF0" } })
  .composite([{ input: full, left: Math.round((1200 - fm.width) / 2), top: Math.round((630 - fm.height) / 2) }])
  .png()
  .toFile("src/app/opengraph-image.png");

// prancheta de conferência
const names = ["logo-icon", "logo-full", "logo-wordmark", "logo-icon-flat", "logo-icon-white", "filament", "brain", "icon-512-maskable"];
const tiles = [];
for (const n of names) {
  const b = await sharp(`${OUT}/${n}.png`).resize(220, 220, { fit: "inside" }).png().toBuffer();
  const m = await sharp(b).metadata();
  tiles.push({ input: b, m });
}
const sheet = sharp({ create: { width: 240 * tiles.length, height: 260, channels: 4, background: "#88aa88" } });
await sheet.composite(tiles.map((t, i) => ({ input: t.input, left: 10 + i * 240 + Math.round((220 - t.m.width) / 2), top: 20 + Math.round((220 - t.m.height) / 2) }))).png().toFile(`${OUT}/_contact-sheet.png`);
console.log("ok →", OUT, "+ src/app/icon.png, apple-icon.png, opengraph-image.png");
