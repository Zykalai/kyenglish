/* Cloudflare Worker：无限制纯转发 + 服务端注入密钥
 * - CORS 全开，处理 OPTIONS 预检
 * - 仅放行 POST /chat/completions
 * - 服务端用加密 Secret VOLC_API_KEY 注入 Authorization
 * - 非流式与流式 SSE 均原样透传，保留 Content-Type，保住打字机效果
 * 无限流/IP/域名/额度限制。 */
export default {
  async fetch(request, env) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const url = new URL(request.url);
    if (request.method !== "POST" || url.pathname !== "/chat/completions") {
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const target = "https://ark.cn-beijing.volces.com/api/v3/chat/completions";
    const upstream = await fetch(target, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.VOLC_API_KEY}`,
      },
      body: request.body,
    });

    const respHeaders = new Headers(upstream.headers);
    respHeaders.set("Access-Control-Allow-Origin", "*");
    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: respHeaders,
    });
  },
};
