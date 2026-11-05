# Cloudflare Pages AI 代理（0 元方案）

如果你的网络能打开 `*.pages.dev`，可以用这个 Pages 项目替代 `workers.dev` 作为 AI 代理。静态站点仍然留在 GitHub Pages，不需要搬家。

## 部署

### 方式 A：网页上传（最简单）

1. Cloudflare Dashboard → Workers & Pages → Create → Pages → **Upload assets**。
2. 项目名填 `ky-ai-proxy`（可自定义），把本目录 `deploy/pages-proxy/` 整个上传/拖进去。
3. 部署完成后得到一个 `https://<project>.pages.dev` 地址。
4. 进入项目 → Settings → Variables and Secrets → Production，添加：
   - `VOLC_API_KEY`：你的火山方舟 API Key，类型选 **Secret**。
   - 可选 `ALLOW_ORIGIN`：默认 `https://ab123666.github.io,null`；如果从本地 `file://` 或别的域名打开，把对应 Origin 加进去（逗号分隔）。
   - 可选 `ARK_URL`：默认 `https://ark.cn-beijing.volces.com/api/v3/chat/completions`，一般不用改。
5. 保存后重新部署一次（Deployments → Retry deployment 或重新上传），让变量生效。

### 方式 B：Wrangler CLI

```powershell
npx wrangler login
npx wrangler pages deploy deploy/pages-proxy --project-name ky-ai-proxy
```

然后在 Pages 项目里配置 `VOLC_API_KEY` 并重新部署。

## 前端接入

```js
localStorage.setItem('e2_aiBaseUrl', 'https://<project>.pages.dev');
location.reload();
```

`baseUrl` 只填到项目根，前端会自动拼 `/chat/completions`。

## 验证

```powershell
curl.exe -i https://<project>.pages.dev/
curl.exe -i -X OPTIONS https://<project>.pages.dev/chat/completions -H "Origin: https://ab123666.github.io"
```

预期：`/` 返回 `{"ok":true,...}`；`OPTIONS` 返回 `204`，并带 `Access-Control-Allow-Origin`。

然后在不挂 VPN 的手机流量下打开站点，点「问AI」测试。

## 注意

- 不要把 `VOLC_API_KEY` 写进 `_worker.js` 或前端；只放 Pages 的 Secret。
- `ALLOW_ORIGIN` 是浏览器跨域限制，不是强鉴权；Pages 项目地址公开，仍有被滥用的可能。Cloudflare 免费额度用尽或被刷时，换 Key 或加 WAF/限流。
- Pages Functions 的流式响应通常可用；如果发现 AI 回复变成一次性出现，检查中间网络是否缓冲了 SSE。
