#!/usr/bin/env node
/**
 * Call VIP warn/kick job (for free Vercel without Cron).
 *
 * Usage:
 *   node scripts/run-vip-cron.mjs
 *   node scripts/run-vip-cron.mjs --url https://razvivashka.vercel.app
 *
 * Env (from .env.local or shell):
 *   CRON_SECRET   — required
 *   PUBLIC_APP_URL — optional default base URL
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvLocal() {
  const p = resolve(process.cwd(), ".env.local");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    if (process.env[m[1]]) continue;
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

loadEnvLocal();

const args = process.argv.slice(2);
const urlIdx = args.indexOf("--url");
const base =
  (urlIdx >= 0 && args[urlIdx + 1]) ||
  process.env.PUBLIC_APP_URL ||
  "https://razvivashka.vercel.app";

const secret = process.env.CRON_SECRET;
if (!secret) {
  console.error("CRON_SECRET is not set");
  process.exit(1);
}

const endpoint = `${base.replace(/\/$/, "")}/api/public/vip/cron?secret=${encodeURIComponent(secret)}`;

const res = await fetch(endpoint, {
  method: "GET",
  headers: { Authorization: `Bearer ${secret}` },
});

const text = await res.text();
console.log(res.status, text);
if (!res.ok) process.exit(1);
