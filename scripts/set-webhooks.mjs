import fs from "fs";

const env = Object.fromEntries(
  fs
    .readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      let v = l.slice(i + 1).trim();
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1);
      }
      return [l.slice(0, i).trim(), v];
    }),
);

const base = process.env.PUBLIC_APP_URL || env.PUBLIC_APP_URL || "https://razvivashka.vercel.app";
const shopSecret = env.TELEGRAM_WEBHOOK_SECRET || "";
const vipSecret = env.VIP_TELEGRAM_WEBHOOK_SECRET || env.TELEGRAM_WEBHOOK_SECRET || "";

async function setHook(name, token, url, secret) {
  const body = { url };
  if (secret) body.secret_token = secret;
  const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  console.log(`${name} setWebhook:`, JSON.stringify(data));
  const info = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`).then((r) =>
    r.json(),
  );
  const r = info.result || {};
  console.log(
    `${name} info:`,
    JSON.stringify({
      url: r.url,
      pending_update_count: r.pending_update_count,
      last_error_message: r.last_error_message || null,
    }),
  );
}

if (!env.TELEGRAM_BOT_TOKEN || !env.VIP_BOT_TOKEN) {
  throw new Error("missing bot tokens in .env.local");
}

await setHook("SHOP", env.TELEGRAM_BOT_TOKEN, `${base}/api/public/telegram/webhook`, shopSecret);
await setHook("VIP", env.VIP_BOT_TOKEN, `${base}/api/public/telegram/webhook-vip`, vipSecret);
console.log("VIP_BOT_USERNAME:", env.VIP_BOT_USERNAME || "(empty)");
console.log("secrets present:", { shop: !!shopSecret, vip: !!vipSecret });
