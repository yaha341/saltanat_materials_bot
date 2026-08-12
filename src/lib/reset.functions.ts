import { createServerFn } from "@tanstack/react-start";
import { requireAdmin } from "./admin-session.server";

async function db() {
  const { supabaseAdmin } = await import("@/integrations-supabase/client.server");
  return supabaseAdmin;
}

/**
 * Клиент, которому принадлежит этот деплой. База общая, поэтому «удалить всё»
 * обязано означать «всё моё»: без этого идентификатора отличить своё от чужого
 * нельзя, и сброс отказывается работать, а не рискует стереть чужой магазин.
 */
function requireBotId(): string {
  const id = process.env.BOT_ID?.trim();
  if (!id) {
    throw new Error(
      "BOT_ID не задан в переменных окружения. Сброс данных отменён: " +
        "без него невозможно отличить данные этого бота от данных других клиентов.",
    );
  }
  return id;
}

/**
 * Удаляет ровно перечисленные объекты. В отличие от обхода бакета целиком, так
 * невозможно задеть файлы другого клиента — хранилище общее.
 */
async function removeFiles(bucket: string, paths: string[]) {
  if (paths.length === 0) return;
  const s = await db();
  for (let i = 0; i < paths.length; i += 100) {
    const { error } = await s.storage.from(bucket).remove(paths.slice(i, i + 100));
    if (error) console.error(`[reset] не удалось удалить из ${bucket}`, error);
  }
}

export const resetAllData = createServerFn({ method: "POST" }).handler(async () => {
  await requireAdmin();
  const botId = requireBotId();
  const s = await db();

  // ── Сначала собираем пути к файлам — потом строки, которые на них ссылаются.
  const [{ data: products }, { data: images }, { data: orders }, { data: materials }] =
    await Promise.all([
      s.from("products").select("file_path, file_path_kz").eq("bot_id", botId),
      s.from("product_images").select("image_path").eq("bot_id", botId),
      s.from("orders").select("payment_proof_path").eq("bot_id", botId),
      s.from("product_material_files").select("file_path").eq("bot_id", botId),
    ]);

  const productFiles = [
    ...(products ?? []).flatMap((p: any) => [p.file_path, p.file_path_kz]),
    ...(materials ?? []).map((m: any) => m.file_path),
  ].filter(Boolean) as string[];
  const imageFiles = (images ?? []).map((i: any) => i.image_path).filter(Boolean) as string[];
  const proofFiles = (orders ?? []).map((o: any) => o.payment_proof_path).filter(Boolean) as string[];

  // ── Строки: дети раньше родителей (внешние ключи).
  await s.from("order_items").delete().eq("bot_id", botId);
  await s.from("orders").delete().eq("bot_id", botId);
  await s.from("cart_items").delete().eq("bot_id", botId);
  await s.from("product_material_files").delete().eq("bot_id", botId);
  await s.from("product_images").delete().eq("bot_id", botId);
  await s.from("products").delete().eq("bot_id", botId);
  await s.from("categories").delete().eq("bot_id", botId);

  await s.from("bot_users").update({ state: {} }).eq("bot_id", botId);

  // ── Файлы: только собранные выше пути.
  await removeFiles("product-files", productFiles);
  await removeFiles("product-images", imageFiles);
  await removeFiles("payment-proofs", proofFiles);

  // Счётчик заказов этого клиента — чтобы нумерация началась заново.
  await s.from("order_counters").update({ last_no: 0 }).eq("bot_id", botId);

  return { ok: true as const };
});
