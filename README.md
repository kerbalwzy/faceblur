# FaceBlur

**在浏览器里给人脸打码的在线工具 —— 素材不会离开你的设备。**

拖动一张照片或一段视频进来，自动检测人脸并模糊/马赛克/遮挡，然后下载结果。
全过程在浏览器本地完成，没有任何上传。

---

## 为什么用它

市面上的在线打码工具大多把原始素材上传到服务器处理，存在泄露风险与信任成本。
FaceBlur 的检测与渲染**全部跑在你的浏览器里**：下载的是程序（约 3.8 MB 的模型与运行时），不是把照片传出去。

这一点不是营销话术，而是由三层保证的：

1. **没有后端** —— 纯静态文件，没有 API、没有数据库；
2. **CSP 锁死出口** —— `connect-src 'self'`，浏览器层面禁止外发；
3. **自动化测试强制** —— CI 中断言处理全程零外部请求。

详见 [docs/privacy.md](docs/privacy.md)。

## 功能

| | |
|---|---|
| **图片** | JPEG / PNG / WebP，拖拽 / 点击 / 粘贴导入，EXIF 方向自动校正 |
| **视频** | MP4 / WebM / MOV，逐帧处理，可取消，导出 MP4/WebM |
| **遮挡样式** | 高斯模糊、马赛克、实心色块，强度可调 |
| **遮罩形状** | 圆角矩形（默认）/ 椭圆，按人脸朝向旋转，覆盖额头与下巴 |
| **逐脸控制** | 单独开关每张脸，或一键全开全关 |
| **导出** | 图片保持原分辨率；视频保持原尺寸 |
| **界面** | 中英双语、明暗主题、移动端可用、键盘可操作 |

## 技术栈

```
Vue 3 + TypeScript + Vite
└── 检测：YuNet (OpenCV Zoo, MIT) 224 KB，动态输入
    └── 推理：onnxruntime-web (MIT) WASM 后端，跑在 Web Worker
└── 渲染：Canvas 2D（多轮降采样模糊 / 块状马赛克）
└── 视频：WebCodecs + mp4-muxer / webm-muxer（不支持时降级 MediaRecorder）
└── 离线：Service Worker + 构建期注入的预缓存清单
```

**生产依赖只有 6 个，全部 MIT 许可证**，适合商用。见 [docs/licenses.md](docs/licenses.md)。

## 快速开始

```bash
npm install
npm run dev          # http://localhost:5173
```

构建与预览：

```bash
npm run build        # 产出 dist/
npm run preview
```

> `npm run build` 会顺带生成 Service Worker 的预缓存清单（`scripts/gen-sw-precache.mjs`）。

## 常用命令

| 命令 | 说明 |
|---|---|
| `npm run dev` | 开发服务器 |
| `npm run build` | 类型检查 + 构建 + 注入 SW 预缓存清单 |
| `npm test` | 单元测试（Vitest，216 项） |
| `npm run test:e2e` | 端到端测试（Playwright，30 项，跑 dev server） |
| `npx playwright test --config playwright.offline.config.ts` | 生产构建 E2E（4 项） |
| `npm run check-licenses` | 商用许可证白名单检查 |
| `npm run benchmark` | 性能基准（需先起 preview） |
| `npm run sync:yunet` | 重新下载并校验 YuNet 模型 |

## 运行环境

| 项 | 要求 |
|---|---|
| 浏览器 | Chrome 91+ / Firefox 89+ / Safari 16.4+（需 WebAssembly SIMD） |
| 内存 | 图片 2 GB 可用；视频建议 8 GB |
| 首次加载 | 约 3.8 MB（gzip），之后离线可用 |

实测性能（Apple Silicon / Chromium / 生产构建）：

- 图片（512×512）导入到检出完成：**824 ms**（含引擎初始化）
- 视频（512×512 / 2 秒 / 60 帧）：**2.1 秒**（约 1.06× 实时）

更多数据与限制见 [docs/limitations.md](docs/limitations.md)。

## 部署

纯静态产物，扔到任何静态托管即可。**推荐配置 COOP/COEP 响应头**以启用多线程推理（快 2–3 倍）。
GitHub Pages 无法自定义响应头，会退化为单线程（功能不受影响）。

完整配置见 [docs/hosting.md](docs/hosting.md)。

## 文档

- [检测引擎](docs/engine.md) —— 契约、预处理、后处理公式、如何替换检测器
- [图片管线](docs/image.md) —— 导入、遮罩几何、模糊实现、导出
- [视频管线](docs/video.md) —— 逐帧处理、追踪、编码路径、取消
- [隐私设计](docs/privacy.md) —— 三层保证与可验证断言
- [已知限制](docs/limitations.md) —— 实测边界、性能、功能缺口
- [许可证清单](docs/licenses.md) —— 依赖与模型的完整许可登记
- [部署配置](docs/hosting.md) —— 响应头、缓存、CSP

## 许可证

本项目代码以 MIT 发布。

第三方组件：

- **YuNet 人脸检测模型** —— [OpenCV Zoo](https://github.com/opencv/opencv_zoo)，MIT
- **onnxruntime-web** —— MIT
- **mp4-muxer / webm-muxer** —— MIT

> 关于 facex：本项目在立项时参考了 [facex](https://github.com/facex-engine/facex) 的
> 「纯浏览器 WASM 人脸检测」思路，但**未使用其任何代码或权重**——其检测器声明为
> CC BY-NC-SA 4.0（禁止商用），与商业使用目标冲突。检测器方案改为 MIT 的 YuNet。
