import { FileText, Paperclip } from "lucide-react";
import Image from "next/image";
import { formatBytes } from "@/lib/utils";

type Meta = { id: string; name: string; mime: string; size: number };

/** Lista de anexos de uma mensagem. Imagens em miniatura; o resto como link de download. */
export function AttachmentList({ files, token }: { files: Meta[]; token?: string | null }) {
  if (files.length === 0) return null;
  const q = token ? `?t=${token}` : "";
  return (
    <ul className="mt-2 flex flex-wrap gap-2">
      {files.map((f) => {
        const href = `/api/files/${f.id}${q}`;
        if (f.mime.startsWith("image/")) {
          return (
            <li key={f.id}>
              <a href={href} target="_blank" rel="noreferrer noopener" className="relative block size-24 overflow-hidden rounded-xl border bg-blush" title={f.name}>
                <Image src={href} alt={f.name} fill sizes="96px" unoptimized className="object-cover" />
              </a>
            </li>
          );
        }
        return (
          <li key={f.id}>
            <a href={href} target="_blank" rel="noreferrer noopener" className="inline-flex max-w-60 items-center gap-2 rounded-xl border bg-card px-3 py-2 text-xs hover:bg-muted">
              <FileText className="size-4 shrink-0 text-muted-foreground" />
              <span className="truncate">{f.name}</span>
              <span className="shrink-0 text-muted-foreground">{formatBytes(f.size)}</span>
            </a>
          </li>
        );
      })}
    </ul>
  );
}

/** Campo de upload padrão para formulários de mensagem. */
export function FileInput({ hint = "Até 4 arquivos de 5 MB: fotos, vídeos, PDF, STL/3MF/OBJ, ZIP." }: { hint?: string }) {
  return (
    <label className="flex cursor-pointer flex-wrap items-center gap-2 rounded-xl border border-dashed bg-card px-3 py-2 text-xs text-muted-foreground hover:bg-muted">
      <Paperclip className="size-4" />
      <span className="flex-1">{hint}</span>
      <input type="file" name="files" multiple accept="image/*,video/*,.pdf,.stl,.3mf,.obj,.step,.stp,.zip,.txt" className="w-full min-w-0 text-xs sm:w-auto sm:max-w-[45%] file:mr-2 file:rounded-md file:border-0 file:bg-rose file:px-2 file:py-1 file:text-xs file:font-medium" />
    </label>
  );
}
