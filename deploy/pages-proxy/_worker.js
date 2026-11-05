/* Cloudflare Pages Functions proxy for the exam reader.
 *
 * Browser -> this Pages project (*.pages.dev) -> existing Cloudflare Worker
 * -> Volcengine Ark. The Worker keeps the Ark key; this project needs no
 * secret. The extra hop is inside Cloudflare and is not subject to the
 * browser-side workers.dev block.
 *
 * Pages settings:
 *   WORKER_URL   = https://kyenglish.a965684016.workers.dev   (optional)
 *   ALLOW_ORIGIN = https://ab123666.github.io,null           (optional)
 */

const DEFAULT_WORKER = "https://kyenglish.a965684016.workers.dev";
const DEFAULT_ALLOW = "https://ab123666.github.io,null";

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
