import { createFileRoute } from "@tanstack/react-router";
import { isVipCronAuthorized } from "@/lib/vip-cron.server";
import { ensureDidWebhooks } from "@/lib/webhook-ensure.server";

/** Only restore webhooks (no warn/kick). Same CRON_SECRET as VIP cron. */
export const Route = createFileRoute("/api/public/telegram/ensure-webhook")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isVipCronAuthorized(request)) {
          return new Response("Unauthorized", { status: 401 });
        }
        const result = await ensureDidWebhooks();
        return Response.json(result, { status: result.ok ? 200 : 500 });
      },
    },
  },
});
