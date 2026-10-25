# 静态托管配置说明

本项目是**纯静态站点**，没有任何业务后端。以下响应头对功能与隐私承诺缺一不可。

## 必需的头

| 头 | 值 | 为什么 |
|---|---|---|
| `Content-Type`（.wasm） | `application/wasm` | 浏览器用 `WebAssembly.instantiateStreaming` 加载 ORT 运行时；类型不对会退化到慢速路径或直接失败 |
| `Content-Type`（.onnx） | `application/octet-stream` | 二进制模型，避免被当作文本处理 |
| `Cache-Control`（`/assets/*`） | `public, max-age=31536000, immutable` | 文件名带内容 hash，可永久缓存 |
| `Cache-Control`（`/models/*`、`/ort/*`） | `public, max-age=31536000, immutable` | 模型与运行时按版本固定，避免每次重新下载 13.6 MB |
| `Cache-Control`（`/index.html`） | `no-cache` | 保证更新能立即生效 |

## 推荐的隔离头（性能）

| 头 | 值 | 作用 |
|---|---|---|
| `Cross-Origin-Opener-Policy` | `same-origin` | 与下一项一起启用跨源隔离 |
| `Cross-Origin-Embedder-Policy` | `require-corp` | 启用 `SharedArrayBuffer`，让 onnxruntime-web 使用多线程 WASM（实测快 2–3 倍） |

**缺失时的行为**：应用会自动检测 `crossOriginIsolated`，为 false 时退回单线程推理（`numThreads = 1`），功能完整但较慢；UI 会提示「当前为单线程模式」。

> 注意：GitHub Pages 无法自定义响应头，部署在那里会走单线程路径。需要多线程请使用 Cloudflare Pages / Netlify / Vercel 或自建 Nginx。

## 各平台落地方式

### Netlify / Cloudflare Pages

使用仓库根目录的 `public/_headers`（Vite 会在构建时复制到 `dist/_headers`）：

```
/assets/*
  Cache-Control: public, max-age=31536000, immutable

/models/*
  Cache-Control: public, max-age=31536000, immutable

/ort/*
  Cache-Control: public, max-age=31536000, immutable

/index.html
  Cache-Control: no-cache

/*
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Embedder-Policy: require-corp
```

### Vercel

`vercel.json`：

```json
{
  "headers": [
    {
      "source": "/(models|ort|assets)/(.*)",
      "headers": [{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }]
    },
    {
      "source": "/(.*)",
      "headers": [
        { "key": "Cross-Origin-Opener-Policy", "value": "same-origin" },
        { "key": "Cross-Origin-Embedder-Policy", "value": "require-corp" }
      ]
    }
  ]
}
```

### Nginx

```nginx
types {
  application/wasm wasm;
  application/octet-stream onnx;
}

location ~ ^/(models|ort|assets)/ {
  add_header Cache-Control "public, max-age=31536000, immutable";
  add_header Cross-Origin-Opener-Policy "same-origin" always;
  add_header Cross-Origin-Embedder-Policy "require-corp" always;
}

location = /index.html {
  add_header Cache-Control "no-cache";
}
```

### 本地开发

`vite.config.ts` 的 `server.headers` / `preview.headers` 已默认开启 COOP/COEP，因此本地与线上（支持隔离头的托管）行为一致。

## CSP

CSP 通过 `index.html` 的 `<meta http-equiv>` 声明（见 design D11）。要点：

- `script-src 'self' 'wasm-unsafe-eval' blob:` —— `wasm-unsafe-eval` 是运行 WASM 的必要项；`blob:` 供 Worker 使用；
- `connect-src 'self' blob: data:` —— 只允许同域资源，**这就是「素材不上传」在浏览器层面的强制保证**；
- `object-src 'none'`、`base-uri 'self'`、`form-action 'none'` —— 收紧其余攻击面。

如托管平台支持响应头形式的 CSP，建议改成响应头（比 meta 更严格，且可作用于 Worker）。
