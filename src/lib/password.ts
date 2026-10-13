import { z } from "zod";

// Regras de senha (compartilhadas entre client e server — sem dependências de servidor aqui).
export const PASSWORD_RULES = "Mínimo de 10 caracteres, com letra maiúscula, minúscula, número e símbolo.";

export const passwordSchema = z
  .string()
  .min(10, "A senha precisa ter pelo menos 10 caracteres")
  .max(128, "Senha muito longa")
  .regex(/[a-z]/, "Inclua ao menos uma letra minúscula")
  .regex(/[A-Z]/, "Inclua ao menos uma letra maiúscula")
  .regex(/\d/, "Inclua ao menos um número")
  .regex(/[^A-Za-z0-9]/, "Inclua ao menos um símbolo (ex.: ! @ # $ %)");

/** Gera uma senha forte aleatória (seed / reset por script). */
export function generateStrongPassword(length = 16) {
  const sets = ["abcdefghjkmnpqrstuvwxyz", "ABCDEFGHJKMNPQRSTUVWXYZ", "23456789", "!@#$%&*?"];
  const all = sets.join("");
  const pick = (chars: string) => chars[Math.floor(Math.random() * chars.length)];
  const base = sets.map(pick);
  while (base.length < length) base.push(pick(all));
  return base.sort(() => Math.random() - 0.5).join("");
}
