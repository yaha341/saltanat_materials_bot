const TG_API = "https://api.telegram.org";

function token() {
  const t = process.env.TELEGRAM_BOT_TOKEN;
  if (!t) throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  return t;
}

async function retryFetch(url: string, options: RequestInit, maxRetries = 3): Promise<Response> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, options);
      if (res.ok || res.status < 500) {
        return res;
      }
      lastError = new Error(`HTTP ${res.status}`);
    } catch (error) {
      lastError = error as Error;
    }
    
    if (attempt < maxRetries) {
      const delay = Math.min(1000 * Math.pow(2, attempt), 5000);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError || new Error("Retry failed");
}

export async function tg(method: string, payload: unknown) {
  try {
    const res = await retryFetch(`${TG_API}/bot${token()}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    // "message is not modified" from editMessageText/editMessageMedia is an expected,
    // harmless outcome (we intentionally re-render onto the same content) — not a real error.
    const benign = typeof data?.description === "string" && /message is not modified/i.test(data.description);
    if ((!res.ok || (data && data.ok === false)) && !benign) {
      console.error(`[telegram] ${method} failed`, res.status, data);
    }
    return data as { ok: boolean; result?: unknown; description?: string };
  } catch (error) {
    console.error(`[telegram] ${method} retry exhausted`, error);
    return { ok: false, description: "Retry exhausted" };
  }
}

export async function tgSendMultipart(
  method: string,
  fields: Record<string, string | number>,
  file: { field: string; filename: string; bytes: Uint8Array; contentType: string },
) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, String(v));
  fd.append(
    file.field,
    new Blob([file.bytes as BlobPart], { type: file.contentType }),
    file.filename,
  );
  
  try {
    const res = await retryFetch(`${TG_API}/bot${token()}/${method}`, {
      method: "POST",
      body: fd,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || (data && data.ok === false)) {
      console.error(`[telegram] ${method} multipart failed`, res.status, data);
    }
    return data as { ok: boolean; result?: unknown; description?: string };
  } catch (error) {
    console.error(`[telegram] ${method} multipart retry exhausted`, error);
    return { ok: false, description: "Retry exhausted" };
  }
}

export async function downloadTelegramFile(file_id: string): Promise<{ bytes: Uint8Array; mime: string } | null> {
  const info = await tg("getFile", { file_id });
  // @ts-expect-error dynamic
  const path = info?.result?.file_path as string | undefined;
  if (!path) return null;
  
  try {
    const res = await retryFetch(`${TG_API}/file/bot${token()}/${path}`, { method: "GET" });
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    const mime = res.headers.get("content-type") || "application/octet-stream";
    return { bytes, mime };
  } catch (error) {
    console.error(`[telegram] downloadFile retry exhausted`, error);
    return null;
  }
}
