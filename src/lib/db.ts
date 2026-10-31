import { PrismaClient } from "@prisma/client";

const g = globalThis as unknown as { __bcPrisma?: PrismaClient };
export const db = g.__bcPrisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") g.__bcPrisma = db;

export type Tx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;

export const j = {
  parse<T>(s: string | null | undefined, fallback: T): T {
    if (!s) return fallback;
    try {
      return JSON.parse(s) as T;
    } catch {
      return fallback;
    }
  },
  str: (v: unknown) => JSON.stringify(v),
};
