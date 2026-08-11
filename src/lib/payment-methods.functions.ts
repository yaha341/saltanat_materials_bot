import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdmin } from "./admin-session.server";

async function db() {
  const { supabaseAdmin } = await import("@/integrations-supabase/client.server");
  return supabaseAdmin;
}

export const listPaymentMethods = createServerFn({ method: "GET" }).handler(async () => {
  await requireAdmin();
  const s = await db();
  const { data, error } = await s.from("payment_methods").select("*").order("sort_order");
  if (error) throw new Error(error.message);
  return data ?? [];
});

const SaveInput = z.object({
  id: z.string().uuid().optional(),
  country_code: z.string().min(1).max(8),
  country_name: z.string().min(1).max(80),
  currency: z.string().min(1).max(8).default("KZT"),
  instructions: z.string().min(1).max(4000),
  sort_order: z.number().int().default(0),
  is_active: z.boolean().default(true),
  qr_code_path: z.string().nullable().optional(),
});

export const savePaymentMethod = createServerFn({ method: "POST" })
  .validator((d: unknown) => SaveInput.parse(d))
  .handler(async ({ data }) => {
    await requireAdmin();
    const s = await db();
    if (data.id) {
      const { error } = await s
        .from("payment_methods")
        .update({
          country_code: data.country_code,
          country_name: data.country_name,
          currency: data.currency,
          instructions: data.instructions,
          sort_order: data.sort_order,
          is_active: data.is_active,
          qr_code_path: data.qr_code_path,
        })
        .eq("id", data.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await s.from("payment_methods").insert({
        country_code: data.country_code,
        country_name: data.country_name,
        currency: data.currency,
        instructions: data.instructions,
        sort_order: data.sort_order,
        is_active: data.is_active,
        qr_code_path: data.qr_code_path,
      });
      if (error) throw new Error(error.message);
    }
    return { ok: true as const };
  });

export const deletePaymentMethod = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    await requireAdmin();
    const s = await db();
    const { error } = await s.from("payment_methods").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });