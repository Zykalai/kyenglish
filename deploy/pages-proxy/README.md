# Cloudflare Pages AI 代理（0 元方案）

当前已部署：<https://kyenglish-ai-proxy.pages.dev>

你的网络能打开 `*.pages.dev`，所以用这个 Pages 项目做一层转发：

```text
浏览器 → https://kyenglish-ai-proxy.pages.dev → 现有 Worker → 火山方舟
```

`workers.dev` 在浏览器侧被挡，但 Cloudflare 内部的 Pages Functions 可以访问现有 Worker；Ark Key 仍然只存在 Worker 里，Pages 项目**不需要任何 Secret**。

## 部署（Wrangler，推荐）

本机需要 Node.js。项目根目录执行：

```powershell
npx wrangler login
npx wrangler pages project create ky-ai-proxy --production-branch main
npx wrangler pages deploy deploy/pages-proxy --project-name ky-ai-proxy --branch main
```

部署成功后会输出 `https://ky-ai-proxy.pages.dev` 之类的地址。

## 部署（网页上传）

1. Cloudflare Dashboard → Workers & Pages → Create → Pages → **Upload assets**。
2. 项目名填 `ky-ai-proxy`，把 `deploy/pages-proxy/` 整个上传。
3. 部署后得到 `https://<project>.pages.dev`。
4. 不需要配置任何环境变量。

如果网页上传不识别 `_worker.js`（Pages 高级模式），用上面的 Wrangler 命令。

## 前端接入

当前默认已经指向 `https://kyenglish-ai-proxy.pages.dev`；如果换项目，改 `src/app_interact.js` 里的默认值，或在控制台执行：

```js
localStorage.setItem('e2_aiBaseUrl', 'https://kyenglish-ai-proxy.pages.dev');
location.reload();
```

`baseUrl` 只填到项目根，前端会自动拼 `/chat/completions`。

## 验证

```powershell
curl.exe -i https://kyenglish-ai-proxy.pages.dev/
curl.exe -i -X OPTIONS https://kyenglish-ai-proxy.pages.dev/chat/completions -H "Origin: https://ab123666.github.io"
```

预期：`/` 返回 `{"ok":true,...}`；`OPTIONS` 返回 `204`，并带 `Access-Control-Allow-Origin`。

然后在不挂 VPN 的手机流量下打开站点，点「问AI」测试。

## 可选配置

- `WORKER_URL`：默认 `https://kyenglish.a965684016.workers.dev`；如果以后换 Worker，改这个变量。
- `ALLOW_ORIGIN`：默认 `https://ab123666.github.io,null`；如果从别的域名打开站点，把对应 Origin 加进去（逗号分隔）。

## 注意

- `ALLOW_ORIGIN` 是浏览器跨域限制，不是强鉴权；Pages 项目地址公开，仍有被滥用的可能。Cloudflare 免费额度用尽或被刷时，换 Key 或加 WAF/限流。
- Pages Functions 的流式响应通常可用；如果发现 AI 回复变成一次性出现，检查中间网络是否缓冲了 SSE。
