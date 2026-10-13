import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { attachments, type AttachmentRef } from "@/db/schema";

// Limites de anexo. Arquivos ficam no banco (BLOB) — trocar por R2/GCS depois mantendo esta interface.
export const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_FILES_PER_MESSAGE = 4;
export const ALLOWED_MIME_PREFIXES = ["image/", "video/", "application/pdf", "model/", "application/zip", "application/x-zip-compressed", "application/octet-stream", "text/plain"];
export const ALLOWED_EXTENSIONS = /\.(png|jpe?g|webp|gif|heic|mp4|mov|webm|pdf|stl|3mf|obj|step|stp|zip|txt)$/i;
// SVG e HTML podem executar script se abertos inline na mesma origem — nunca aceitar.
const BLOCKED = /(\.svgz?|\.html?|\.xhtml|\.xml|\.js|\.mjs)$/i;
const BLOCKED_MIME = /svg|html|xml|javascript/i;

export type UploadResult = { saved: number; rejected: string[] };

/** Salva os arquivos de um FormData (campo `files`) vinculados a uma mensagem. */
export async function saveUploads(formData: FormData, refType: AttachmentRef, refId: string, uploaderId?: string | null): Promise<UploadResult> {
  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0).slice(0, MAX_FILES_PER_MESSAGE);
  const rejected: string[] = [];
  let saved = 0;
  for (const f of files) {
    const okType = (ALLOWED_MIME_PREFIXES.some((p) => f.type.startsWith(p)) || ALLOWED_EXTENSIONS.test(f.name)) && !BLOCKED.test(f.name) && !BLOCKED_MIME.test(f.type);
    if (!okType) {
      rejected.push(`${f.name}: tipo não permitido`);
      continue;
    }
    if (f.size > MAX_FILE_BYTES) {
      rejected.push(`${f.name}: acima de 5 MB`);
      continue;
    }
    const data = Buffer.from(await f.arrayBuffer());
    await db.insert(attachments).values({
      refType,
      refId,
      name: f.name.slice(0, 200),
      mime: f.type || "application/octet-stream",
      size: f.size,
      data,
      uploaderId: uploaderId ?? null,
    });
    saved++;
  }
  return { saved, rejected };
}

/** Lista metadados (sem o binário) dos anexos de várias mensagens. */
export async function listAttachments(refType: AttachmentRef, refIds: string[]) {
  if (refIds.length === 0) return [];
  const rows = await db.query.attachments.findMany({
    where: and(eq(attachments.refType, refType)),
    columns: { id: true, refId: true, name: true, mime: true, size: true, createdAt: true },
  });
  return rows.filter((r) => refIds.includes(r.refId));
}

export { formatBytes } from "./utils";
