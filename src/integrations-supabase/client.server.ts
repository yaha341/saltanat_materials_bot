// Server-side Supabase client.
//
// This database is shared by every client bot. Isolation is enforced by
// Postgres, not by remembering to filter: when SUPABASE_TENANT_KEY is set the
// deployment talks to PostgREST as the `tenant_bot` role carrying its own
// bot_id claim, and the RLS policies from MIGRATION-02 scope every row to that
// tenant automatically. Leave the variable unset and behaviour is exactly as
// before — service_role, which bypasses RLS — so the switch can be undone by
// removing one environment variable.
//
// Storage is deliberately excluded: buckets are shared and the storage service
// does not resolve the custom role, so `.storage` keeps using service_role
// while `.from()` / `.rpc()` go through the isolated connection.
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

function isNewSupabaseApiKey(value: string): boolean {
  return value.startsWith('sb_publishable_') || value.startsWith('sb_secret_');
}

/**
 * @param apiKey gateway credential — must be one of the project's real keys;
 *               the API gateway rejects anything else before PostgREST sees it
 * @param bearer identity PostgREST derives the Postgres role from: the tenant
 *               key when configured, otherwise the same key as the gateway one
 */
function createSupabaseFetch(apiKey: string, bearer: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== 'undefined' && input instanceof Request ? input.headers : undefined,
    );

    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }

    headers.set('apikey', apiKey);

    // New Supabase API keys are opaque strings, not bearer JWTs.
    if (isNewSupabaseApiKey(bearer)) {
      headers.delete('Authorization');
    } else {
      headers.set('Authorization', `Bearer ${bearer}`);
    }

    return fetch(input, { ...init, headers });
  };
}

function readEnv() {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    const missing = [
      ...(!url ? ['SUPABASE_URL'] : []),
      ...(!serviceKey ? ['SUPABASE_SERVICE_ROLE_KEY'] : []),
    ];
    const message = `Missing Supabase environment variable(s): ${missing.join(", ")}. Set them in your deployment environment.`;
    console.error(`[Supabase] ${message}`);
    throw new Error(message);
  }
  const tenantKey = process.env.SUPABASE_TENANT_KEY?.trim() || null;

  // BOT_ID means this deployment belongs to one client of a shared database.
  // Without the tenant key it would connect as service_role, which bypasses
  // RLS and quietly exposes every other client's catalogue, orders and
  // customers — the failure mode that actually happened once. Refuse to start
  // instead: a loud error beats a silent leak. To roll back to unrestricted
  // access, remove BOT_ID as well.
  if (process.env.BOT_ID?.trim() && !tenantKey) {
    const message =
      "BOT_ID задан, а SUPABASE_TENANT_KEY — нет. Без него подключение идёт " +
      "под service_role и видит данные всех клиентов. Добавьте SUPABASE_TENANT_KEY.";
    console.error(`[Supabase] ${message}`);
    throw new Error(message);
  }

  return { url, serviceKey, tenantKey };
}

function build(bearer: string) {
  const { url, serviceKey } = readEnv();
  return createClient<Database>(url, serviceKey, {
    global: { fetch: createSupabaseFetch(serviceKey, bearer) },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}

type Client = ReturnType<typeof build>;

let _service: Client | undefined;
let _db: Client | undefined;

/** Full-privilege client: storage, and any deliberate cross-tenant work. */
function serviceClient(): Client {
  if (!_service) _service = build(readEnv().serviceKey);
  return _service;
}

/** Table access — isolated to this tenant when SUPABASE_TENANT_KEY is set. */
function dbClient(): Client {
  if (!_db) {
    const { tenantKey } = readEnv();
    _db = tenantKey ? build(tenantKey) : serviceClient();
  }
  return _db;
}

// SECURITY: server-side only. Route files and *.functions.ts ship to the client
// bundle, so import this inside handlers:
//   const { supabaseAdmin } = await import("@/integrations-supabase/client.server");
export const supabaseAdmin = new Proxy({} as Client, {
  get(_, prop, receiver) {
    if (prop === 'storage') return serviceClient().storage;
    return Reflect.get(dbClient(), prop, receiver);
  },
});
