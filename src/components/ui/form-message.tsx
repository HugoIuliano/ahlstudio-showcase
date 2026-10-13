import { cn } from "@/lib/utils";

export type ActionState = { ok?: boolean; error?: string; message?: string; fieldErrors?: Record<string, string> } | null | undefined;

/** Mostra erro/sucesso retornado por uma server action via useActionState. */
export function FormMessage({ state, className }: { state: ActionState; className?: string }) {
  if (!state?.error && !state?.message) return null;
  return (
    <p
      role={state.error ? "alert" : "status"}
      className={cn(
        "rounded-lg border px-3 py-2 text-sm",
        state.error ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800",
        className,
      )}
    >
      {state.error ?? state.message}
    </p>
  );
}
