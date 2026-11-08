/* Cloudflare Pages Functions proxy for the exam reader.
 *
 * Browser -> this Pages project (*.pages.dev) -> existing Cloudflare Worker
 * -> Volcengine Ark. The Worker keeps the Ark key; this project needs no
 * secret. The extra hop is inside Cloudflare and is not subject to the
 * browser-side workers.dev block.
 *
 * Pages settings:
 *   WORKER_URL   = https://kyenglish.a965684016.workers.dev   (optional)
 *   ALLOW_ORIGIN = https://zykalai.github.io,https://ab123666.github.io,null (optional)
 *
 * Translation is a separate, stateless channel:
 *   Browser -> /translate -> Ark Responses API (doubao-seed-translation)
 * It sends only the selected sentence; no chat history, no context.
 * Set ARK_TRANSLATE_API_KEY as a Pages secret. The endpoint ID is not secret.
 */

const DEFAULT_WORKER = "https://kyenglish.a965684016.workers.dev";
const DEFAULT_ALLOW = "https://zykalai.github.io,https://ab123666.github.io,null";
const DEFAULT_TRANSLATE_ENDPOINT = "ep-20261105203321-sd6jb";
const ARK_RESPONSES_URL = "https://ark.cn-beijing.volces.com/api/v3/responses";

function cors(request, env) {
  const allow = String(env.ALLOW_ORIGIN || DEFAULT_ALLOW)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const origin = request.headers.get("Origin");
  const allowed = !origin || allow.includes("*") || allow.includes(origin);
  const headers = {
    "Access-Control-Allow-Origin": allowed ? (origin || "*") : "null",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
  return { allowed, headers };
}

function json(data, status, headers) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...headers },
  });
}

function extractTranslation(data) {
  if (typeof data.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim();
  }
  for (const item of Array.isArray(data.output) ? data.output : []) {
    for (const part of Array.isArray(item.content) ? item.content : []) {
      if (part.type === "output_text" && typeof part.text === "string" && part.text.trim()) {
        return part.text.trim();
      }
    }
  }
  return "";
}

async function handleTranslate(request, env, headers) {
  // Each request is independent: only { text } is accepted, never history/context.
  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400, headers);
  }
  const text = typeof payload?.text === "string" ? payload.text.trim() : "";
  if (!text) return json({ error: "Empty text" }, 400, headers);
  if (text.length > 5000) return json({ error: "Text too long" }, 413, headers);
  if (!env.ARK_TRANSLATE_API_KEY) {
    return json({ error: "ARK_TRANSLATE_API_KEY is not configured" }, 500, headers);
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30000);
  let upstream;
  try {
    upstream = await fetch(ARK_RESPONSES_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${env.ARK_TRANSLATE_API_KEY}`,
      },
      body: JSON.stringify({
        model: env.ARK_TRANSLATE_ENDPOINT || DEFAULT_TRANSLATE_ENDPOINT,
        input: [{
          role: "user",
          content: [{
            type: "input_text",
            text,
            translation_options: { source_language: "en", target_language: "zh" },
          }],
        }],
      }),
      signal: ctrl.signal,
    });
  } catch (e) {
    return json({ error: "Translation upstream failed", detail: String(e) }, 502, headers);
  } finally {
    clearTimeout(timer);
  }

  const raw = await upstream.text();
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return json({ error: "Bad upstream response" }, 502, headers);
  }
  if (!upstream.ok) {
    return json({ error: data?.error?.message || `Upstream HTTP ${upstream.status}` }, 502, headers);
  }
  const translation = extractTranslation(data);
  if (!translation) return json({ error: "Empty translation" }, 502, headers);
  return json({ translation }, 200, { ...headers, "Cache-Control": "no-store" });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { allowed, headers } = cors(request, env);

    if (request.method === "OPTIONS") {
      return allowed
        ? new Response(null, { status: 204, headers })
        : json({ error: "Origin not allowed" }, 403, headers);
    }
    if (!allowed) {
      return json({ error: "Origin not allowed" }, 403, headers);
    }
    if (request.method === "GET" && url.pathname === "/") {
      return json({ ok: true, service: "ky-ai-proxy" }, 200, headers);
    }
    if (request.method === "POST" && url.pathname === "/translate") {
      return handleTranslate(request, env, headers);
    }
    if (request.method !== "POST" || url.pathname !== "/chat/completions") {
      return json({ error: "Not found" }, 404, headers);
    }

    const body = await request.text();
    if (!body) {
      return json({ error: "Empty request body" }, 400, headers);
    }

    const workerBase = String(env.WORKER_URL || DEFAULT_WORKER).replace(/\/+$/, "");
    let upstream;
    try {
      upstream = await fetch(workerBase + "/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "text/event-stream",
        },
        body,
      });
    } catch (e) {
      return json({ error: "Upstream connection failed", detail: String(e) }, 502, headers);
    }

    const out = new Headers(upstream.headers);
    // fetch() has already decoded the body; these headers would corrupt it.
    out.delete("content-encoding");
    out.delete("content-length");
    for (const [k, v] of Object.entries(headers)) out.set(k, v);
    out.set("Cache-Control", "no-cache, no-transform");

    return new Response(upstream.body, { status: upstream.status, headers: out });
  },
};
