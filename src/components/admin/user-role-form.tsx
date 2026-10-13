"use client";

import { useActionState } from "react";
import { USER_ROLES, type UserRole } from "@/db/schema";
import { ROLE_LABELS } from "@/lib/rbac";
import { updateUserRoleAction } from "@/actions/users";
import { Select } from "@/components/ui/input";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";

export function UserRoleForm({ user, self }: { user: { id: string; role: UserRole; active: boolean }; self: boolean }) {
  const [state, action] = useActionState(updateUserRoleAction, null);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={user.id} />
      <Select name="role" defaultValue={user.role} className="h-8 w-44 text-xs" disabled={self}>
        {USER_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
      </Select>
      <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" name="active" defaultChecked={user.active} disabled={self} className="accent-primary-strong" /> ativo</label>
      {!self && <SubmitButton size="sm" variant="outline" pendingText="…">Salvar</SubmitButton>}
      <FormMessage state={state} className="w-full py-1 text-xs" />
    </form>
  );
}
