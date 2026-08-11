import { createFileRoute } from "@tanstack/react-router";
import { verifyTelegramWebhookSecret } from "@/lib/telegram-webhook.server";

export const Route = createFileRoute("/api/public/telegram/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!verifyTelegramWebhookSecret(request, ["TELEGRAM_WEBHOOK_SECRET"])) {
          return new Response("unauthorized", { status: 401 });
        }
        let update: unknown;
        try {
          update = await request.json();
        } catch {
          return new Response("bad json", { status: 400 });
        }
        const { handleUpdate } = await import("@/lib/bot.server");
        await handleUpdate(update);
        return new Response("ok");
      },
    },
  },
});
