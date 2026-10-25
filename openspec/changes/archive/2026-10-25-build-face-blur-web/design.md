# Design

## Context

- 仓库现状：`openspec/` 之外无任何代码；上一次提交删除了旧的 Python/FastAPI + Vue 方案，`.gitignore` 已按 Node 项目配置。
- **商业前提（决定性约束）**：项目有明确商业化计划，所有依赖 MUST 允许商用。因此虽然最初参考了 facex，但**其检测器不可采用**：`include/detect.h` 标注 `CC BY-NC-SA 4.0`（禁止商用），与仓库根 README 声称的 Apache-2.0 冲突；在商用场景下这种冲突属于不可接受的法律风险。facex 在本项目中仅作为「纯前端 WASM 人脸检测」的思路参考，不复制其代码与权重。
- 已核对的商用检测方案（数据来自 2026-10 实际查询）：

  | 方案 | 许可证 | 权重体积 | 精度（WIDER Easy AP） | 关键点 | 结论 |
  |---|---|---|---|---|---|
  | **YuNet（OpenCV Zoo）** | **MIT**（模型目录自带 LICENSE） | **224 KB**（2026may 动态输入） | **0.8810 / 0.8844** | 5 点 | **采用** |
  | MediaPipe FaceDetector | Apache-2.0 | 约 230 KB + 大运行时 | 高 | 6 点 | 备选：体积大 |
  | @vladmandic/human (BlazeFace) | MIT | 539 KB | 需自评 | 6 点 | 备选：精度不如 YuNet |
  | facex detect | **CC BY-NC-SA** | 30 KB + 686 KB | 小脸召回约 85% | 5 点 | **禁止** |
- YuNet 模型事实（**已在本机浏览器实测**，非文档推断）：输入 `input`（NCHW，RGB 0–255），多尺度输出 `cls_8/16/32`、`obj_8/16/32`、`bbox_8/16/32`、`kps_8/16/32`，即 5 个关键点（右眼、左眼、鼻尖、右嘴角、左嘴角），与本次需求完全匹配。
- **模型版本选择（实测结论，与最初设想不同）**：

  | 文件 | 输入尺寸 | 320 推理 | 640 推理 | 体积 | 结论 |
  |---|---|---|---|---|---|
  | `2023mar_int8.onnx` | **固定 640** | ❌ 报维度错误 | 37.8 ms | 100 KB | 不可用 |
  | `2023mar_int8bq.onnx` | 固定 640 | ❌ | ❌ ORT 加载失败（block 量化不支持） | 122 KB | 不可用 |
  | **`2026may.onnx`** | **动态** | **4.2 ms** | **9.6 ms** | 224 KB | **采用** |

  结论：只有 `2026may` 支持 320/480/640 三档切换（D15 的精度档位才有意义），且比 int8 固定 640 快约 4 倍。体积多 124 KB 换取 4 倍速度与可用档位，值得。
- 推理运行时：`onnxruntime-web` 最新版 1.30.0，**MIT 许可**，提供 WASM（含 SIMD 多线程/单线程）与 WebGPU 后端。
- 目标浏览器：Chromium 与 Safari 16.4+，均支持 WASM SIMD。

## Goals / Non-Goals

**Goals:**

- 纯静态、零后端的单页工具，可在任意静态托管上直接运行，同时满足商用上线的合规要求。
- 检测层与渲染层解耦：检测器可替换、遮挡渲染可替换样式。
- 图片路径做到「原图分辨率无损导出」；视频路径做到内存稳定、可取消。
- 依赖可审计：每一项依赖的许可证都可在仓库内查到。

**Non-Goals:**

- 不做人脸识别/身份比对，不需要 embedding 模型。
- 不做服务端转码兜底（纯前端约束）。
- 不做实时摄像头模式（本期不做，接口上不排斥后续扩展）。
- 不自研人脸检测模型（成本与数据许可风险都高于收益），先用成熟的 MIT 模型。
- 不提供账号、历史记录、云同步、批量服务端队列。

## Decisions

### D1. 技术栈：Vite + Vue 3 + TypeScript + Pinia + vue-i18n

- **理由**：团队熟悉 Vue；Vite 对静态 WASM、Worker 打包和 `.wasm` MIME 处理开箱即用；TypeScript 便于为检测适配器定义契约。
- **备选**：React + Next.js（静态导出）——对纯静态部署的 WASM 配置更繁琐；原生 TS + DOM——多语言与可访问性成本高。
- **决定**：不使用 UI 组件库，用少量自研 CSS + CSS 变量实现主题，控制首屏体积。

### D2. 检测器选型：YuNet INT8 + onnxruntime-web

- **模型**：`face_detection_yunet_2026may.onnx`（OpenCV Zoo，MIT，224 KB，动态输入尺寸），随站点静态托管在 `public/models/yunet.onnx`，SHA256 由 `scripts/sync-yunet.mjs` 生成校验。
- **运行时**：`onnxruntime-web`（MIT）。构建时只引入 WASM 后端所需文件，关闭 WebGPU 后端以控制体积。
- **理由**：
  1. **许可证干净**（MIT + MIT），是商用前提下的硬门槛；
  2. 体积比 facex 方案更小（224 KB vs 686 KB）；
  3. 精度更高（WIDER Easy AP 0.8810 vs facex 自述小脸召回约 85%）；
  4. 原生输出 5 个关键点，遮罩形状可以直接用上；
  5. 有多尺度输出（8/16/32），天然支持大小脸同时检出。
- **备选**：MediaPipe（运行时重）、human（精度弱）、自己移植 C 引擎（维护成本高、商用反而增加合规负担）。
- **决定**：YuNet + ORT WASM 后端。检测器仍走适配器接口，将来若要自研或换模型，只需新增适配器。

### D3. 目录结构

```
faceblur/
├─ public/
│  ├─ models/yunet.onnx                # 224 KB，动态输入，静态托管
│  ├─ ort/*.wasm, *.mjs                # onnxruntime-web 运行时文件（构建期复制）
│  └─ favicon.ico, og.png
├─ src/
│  ├─ main.ts, App.vue
│  ├─ engine/
│  │  ├─ detector.ts                   # FaceDetector 接口 + 类型
│  │  ├─ yunet-detector.ts             # YuNet + ORT 适配器（Worker 内使用）
│  │  ├─ postprocess/yunet.ts          # 解码多尺度输出 + NMS
│  │  ├─ worker/detect.worker.ts       # Worker 宿主：加载、推理、消息协议
│  │  ├─ worker/protocol.ts            # 主线程 ↔ Worker 消息类型
│  │  ├─ io/weight-cache.ts            # IndexedDB 缓存
│  │  └─ io/letterbox.ts               # 缩放补边 + 坐标反变换
│  ├─ pipeline/
│  │  ├─ image-pipeline.ts             # 图片：解码 → 检测 → 渲染 → 导出
│  │  ├─ video-pipeline.ts             # 视频：逐帧 → 检测 → 渲染 → 编码
│  │  ├─ render/blur.ts                # 高斯/马赛克/色块绘制
│  │  ├─ render/mask-shape.ts          # 由 bbox+kps 生成遮挡区域
│  │  └─ video/track.ts                # 帧间结果关联，抑制闪烁
│  ├─ stores/session.ts                # 当前素材、检测结果、参数
│  ├─ stores/prefs.ts                  # 语言、主题、导出质量
│  ├─ components/ (Uploader, ImageStage, VideoStage, FaceList, StylePicker, ProgressBar, Footer ...)
│  ├─ locales/{zh-CN,en}.json
│  └─ styles/
├─ docs/{licenses.md, engine.md, image.md, video.md, privacy.md, limitations.md}
└─ tests/ (vitest 单测 + playwright e2e)
```

### D4. 检测器契约：主线程薄封装 + Worker 推理

```ts
// src/engine/detector.ts
export interface DetectionOptions { minScore?: number; detSize?: 320 | 480 | 640 }
export interface FaceBox { x: number; y: number; width: number; height: number; score: number; kps: [number, number][] }

// 主线程侧对外接口（内部转发到 Worker）
export interface FaceDetectorClient {
  init(onProgress?: (p: { stage: 'runtime' | 'model' | 'session'; ratio: number }) => void): Promise<void>
  detect(bitmap: ImageBitmap, opts?: DetectionOptions): Promise<FaceBox[]>
  dispose(): Promise<void>
}
```

- **理由**：Worker 隔离保证「推理不阻塞主线程」；主线程只接触 `ImageBitmap`（`transferable`，零拷贝传输）。
- **决定**：始终走 Worker，代价仅一次消息往返。

### D5. 引擎装载顺序（Worker 内）

1. Worker 使用 **module worker**（`new Worker(new URL('./detect.worker.ts', import.meta.url), { type: 'module' })`），直接 `import * as ort from 'onnxruntime-web'`。
2. 配置 `ort.env.wasm.wasmPaths = '/ort/'`，并把 `wasmPaths` 指向的 `.wasm`/`.mjs` 从 `node_modules` 复制到 `public/ort/`（构建脚本 `scripts/sync-ort.mjs`），确保与 `.wasm` MIME 和缓存策略一致。
3. ORT 加载的两个坑（已实测并解决，实施时务必照做）：
   - **不能用默认入口**：`onnxruntime-web` 默认入口会去找 `ort-wasm-simd-threaded.jsep.*`（WebGPU，27 MB）。必须用别名指向 `dist/ort.wasm.min.mjs`（纯 WASM 后端）。
   - **不能让 Vite 从 `public/` 动态 import 胶水**：dev 服务器会拒绝。做法是通过别名把 `ort-wasm-simd-threaded.mjs` 与 `.wasm?url` 引入（见 `src/engine/ort-glue.ts`），再由 ORT 的 `wasmPaths` 指向 `?url` 解析出的目录。
4. 权重：`loadWeightsCached('/models/yunet.onnx', 'yunet_v1')` → `session = await ort.InferenceSession.create(bytes, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' })`。
5. 若环境支持多线程（需要 COOP/COEP 跨源隔离头），设置 `ort.env.wasm.numThreads = min(4, hardwareConcurrency)`；不支持时自动退回 `numThreads = 1`。
6. 会话按 detSize 复用；`dispose()` 时释放会话与缓存。

### D6. 预处理与坐标反变换

YuNet 的标准预处理：letterbox 到**正方形输入（默认 320×320）**，等比缩放、居中补 `114` 灰边（OpenCV 惯例），像素保持 **RGB、0–255、NCHW**。

```ts
const s = detSize / Math.max(W, H)
const nw = Math.round(W * s), nh = Math.round(H * s)
const dx = (detSize - nw) / 2, dy = (detSize - nh) / 2
// 反变换：原始坐标 = (检测坐标 - d) / s
```

- 输入张量形状 `[1, 3, detSize, detSize]`，`Float32Array`，不做归一化（YuNet 使用原始 0–255 输入）。
- 小图（短边 < 160px）先放大后再检测，避免小脸被漏掉。
- `detSize` 默认 320（实测单帧 4.2 ms）；「高精度」档用 480（6.0 ms）或 640（9.6 ms），并配合两阶段裁剪重检。

> **视频路径例外**：视频逐帧检测 MUST 固定使用 `detSize = 320`，不开放 480/640 选项。原因见 D15 —— 视频中每提一档分辨率，整段视频的处理时间按面积倍数增长，480 会让 1080p 视频的处理时间逼近或超过实时的 2 倍，直接破坏可用性。视频的精度提升只通过两阶段检测（D15）实现。

### D7. 后处理（`postprocess/yunet.ts`）

- 对 8/16/32 三个尺度分别：`score = sqrt(cls * obj)`（YuNet 官方做法），超过阈值才解码。
- 边界框：`cx = (col + bbox[0]) * stride`，`w = exp(bbox[2]) * stride`（按 YuNet 官方公式），再映射回输入坐标与原始坐标。
- 关键点：`kps[2k] = (col + kps[2k]) * stride`，同理映射。
- NMS：按分数降序，IoU 阈值 0.3 去重；同时做跨尺度去重（IoU 0.3 或关键点距离过近）。
- **阈值可配置**：默认 `minScore = 0.6`，可通过 UI 调整，在 JS 侧过滤（规格「检测器可配置阈值」）。

### D8. 遮挡区域形状

- `expandedBox(face) = bbox 外扩 12% 宽、18% 高（向上多扩，覆盖额头）`
- 默认遮罩：**圆角矩形**，保证侧脸时四角不露脸颊；可切换「椭圆（更自然）」：以两眼中点与嘴角构成面部主轴，画旋转椭圆。
- 关键点缺失或异常（NaN、间距过小）时退回 bbox 矩形遮罩。

### D9. 渲染实现（图片）

1. 用离屏 canvas 绘制原图；
2. 对每个人脸：`ctx.save(); ctx.beginPath(); 加遮罩路径; ctx.clip()`;
3. 高斯模糊：以「局部缩小采样 + 放大」为主路径，`ctx.filter = 'blur(Npx)'` 作为增强（Safari 对超大 canvas 的 `filter` 支持有差异）；
4. 马赛克：`imageSmoothingEnabled = false`，区域降采样到 `w/block` 再放大；
5. 色块：填充配置的颜色（默认 `#000`，可调不透明度）。

模糊半径按素材尺寸比例计算：`radius = clamp(shortSide * strength * 0.02, 8, 80)`，保证预览与导出（及视频帧）一致。
参数调整只重跑渲染（毫秒级），不重跑检测；预览用 `requestAnimationFrame` + 80 ms 防抖。

### D10. 视频管线

```
<video src=objectURL> → WebCodecs VideoDecoder（可用时）或 seek 逐帧
   → ImageBitmap → worker.detect → trackSmooth
   → OffscreenCanvas 绘制遮挡
   → VideoEncoder（WebCodecs）→ mp4-muxer / webm-muxer
```

- **首选 WebCodecs**：可控帧序、无实时限制、速度快于实时。muxer 使用 `mp4-muxer` / `webm-muxer`（均为 MIT）。
- **降级 MediaRecorder**：`canvas.captureStream(fps)` + 混音，实时录制；Safari 输出 MP4、Chromium 输出 WebM，码率不可控，UI 标注「实时录制模式」。
- 时序平滑（`track.ts`）：维护上一帧人脸列表，本帧未检出时若与上一帧 IoU > 0.3 的轨迹存在则沿用（3 帧后移除）。采用最简 SORT 风格 IoU 关联，不引入额外依赖。
- 内存：逐帧 `close()` 原始帧，只保留当前与前一帧；`MAX_INFLIGHT = 4` 控制解码并发。

### D11. 隐私边界（可验证）

- 静态资源全部自托管：模型放 `public/models/`、ORT 运行时放 `public/ort/`，彻底避免第三方域名请求。
- CSP：`default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self' blob: data:; img-src 'self' blob: data:; media-src 'self' blob:`
- Playwright 断言：处理过程中 `page.on('request')` 只出现同域静态资源。
- 素材与检测结果只存在内存（Pinia store / 局部变量）；`prefs` 只存语言/主题/质量。

### D12. 商用合规纪律

- `docs/licenses.md` 逐项登记：npm 生产依赖、模型权重、muxer、字体、图标、构建工具。
- CI 增加检查：生产依赖的 `license` 字段必须命中白名单（MIT/Apache-2.0/BSD-2/BSD-3/ISC/0BSD），非白名单则在 PR 阶段失败。
- 不引入 GPL/LGPL/NC 依赖；如必须使用 LGPL，需单独评审（静态 JS 分发场景下通常不可接受）。
- 模型若将来替换为自研，训练数据许可证同样纳入审计。

### D13. 状态管理

- `session` store：`{ file, kind:'image'|'video', stage, faces[], perFaceEnabled[], style, strength, exportBlob }`。
- `stage` 状态机：`idle → loading → detecting → ready → rendering → done | error`，用一个 enum + 派生 enabled 规则，避免散落布尔值。

### D14. 运行环境基线

检测本身很轻（YuNet，动态输入；本机实测 320 输入单帧 **4.2 ms**、640 输入 **9.6 ms**），**硬件瓶颈在视频的解码/编码与画布渲染，而非模型推理**；GPU 仅在视频编解码与画布合成时参与，人脸检测始终跑在 CPU。

| 项 | 图片 | 视频（1080p/30fps） |
|---|---|---|
| CPU | 任意双核，2018 年后 | 4 核以上，2018 年后 |
| 内存 | 2 GB 可用 | 8 GB 可用（16 GB 舒适） |
| GPU | 无要求 | 有硬件视频编解码即可（集显足够） |
| 浏览器 | Chrome 91+ / Firefox 89+ / Safari 16.4+（WASM SIMD 为硬门槛） | 同上，优先 Chromium 系 |
| 首次下载 | 约 14 MB 未压缩（ORT WASM 13.6 MB + 模型 224 KB），gzip 后约 **3.8 MB** | 同左 |

实测基线（MacBook / Chromium，单线程与四线程均测）：检测单帧 4.2 ms（320）/ 6.0 ms（480）/ 9.6 ms（640），会话创建约 60 ms，WASM 首次加载约 30 ms。图片单张在 1–2 秒内出结果；1080p 视频约 0.3–1.5 倍实时（有硬件编解码时更快），老旧设备可能超过 2 倍实时。其余为估算，以 6.3 的三类设备实测为准，并写入 `docs/limitations.md`。

### D15. 精度与性能权衡矩阵

提高检测精度有四类手段，代价从「几乎免费」到「不可接受」不等。**核心原则：图片可以等 2 秒，视频不能等到实时的 3 倍以上。**

| 档位 | 手段 | 精度收益 | 代价 | 采用 |
|---|---|---|---|---|
| 免费 | 降低置信度阈值 `0.6 → 0.3` | 召回提升 | 误检上升 | 可选（用户开关） |
| 免费 | 小图先放大再检测 | 解决整图小脸 | 可忽略 | ✅ |
| 低 | 提高输入分辨率 `320 → 480 / 640` | 小脸召回明显提升（YuNet 训练范围约 10–300px 脸） | 计算量按面积增长：480 约 2.25×，640 约 4× | ✅ 仅图片高精度档 |
| 低 | **两阶段检测（crop-and-retry）** | 小脸召回显著提升 | 平均 +20–40% 耗时 | ✅ 默认开启 |
| 中 | 分块检测（tiling） | 超大图/远景群脸 | 时间近线性增长 + 块边界切断需重叠去重 | ❌ 本期不做 |
| 中 | 多尺度融合（320+480 各跑一遍） | 略优于两阶段 | 时间 ×2，去重易出错 | ❌ 本期不做 |
| 高 | 换更重模型（RetinaFace / SCRFD） | 侧脸与小脸更好 | 体积 0.7–5 MB、推理慢 3–5×、后处理需重写 | ❌ 仅在同接口下预留 |
| 不可接受 | 云端 API | 最高 | 违背零上传 | ❌ |

**决策：**

- **图片**：默认 320 + 两阶段检测；「高精度」开关允许切到 480/640。
- **视频**：**固定 320**，只保留两阶段检测与阈值调节。视频里每帧都跑，分辨率提高 4 倍会直接毁掉体验，不做可选项。
- **误检优先于漏检的取舍**：对面部打码工具而言，把「墙上的画」「手里的包」糊掉比漏一张脸的负面体验更重，因此默认阈值定在 0.6 而非 0.3；漏检的最终解法是用户手动补画区域（接口已预留，本期不做）。
- **不做云端兜底**：宁可在低端设备上慢一点，也不破坏「素材不出浏览器」这一核心卖点。

## Risks / Trade-offs

- **[onnxruntime-web 体积大于专用 WASM 引擎]** → 只启用 WASM 后端、关闭 WebGPU 与训练相关文件；运行时按需加载，不影响首屏。相比 686 KB 模型方案，总体下载量仍更低。
- **[多线程需要 COOP/COEP 隔离头，GitHub Pages 无法设置]** → 自动检测 `crossOriginIsolated`，不支持时退回单线程；文档说明如何在自己的 CDN 上开启隔离以提速。
- **[YuNet 官方后处理容易写错（sqrt(cls*obj)、exp 解码）]** → 单测固定一张已知图片与期望框做回归；并保留 FP32 模型作为对照。
- **[Safari 的 `ctx.filter` 与 OffscreenCanvas 差异]** → 模糊走「缩小采样 + 放大」主路径，`filter` 仅作增强；e2e 覆盖 iOS Safari。
- **[WebCodecs muxer 复杂度]** → 使用成熟小型 muxer，不自行实现容器；MediaRecorder 降级已列入任务。
- **[长视频内存]** → 背压 + 逐帧释放；>5 分钟视频给出提示。
- **[商用后仍可能被要求提供模型来源证明]** → `docs/licenses.md` + 页脚署名 + 模型原始 LICENSE 文件一并提交到仓库。

## Migration Plan

1. 新增项目骨架与 `public/` 资产（模型 + ORT 运行时），不触碰历史。
2. 实现 `engine/` 与最小验证页（能框出人脸），本地 `npm run dev` 先跑通 ORT 会话。
3. 实现图片管线 → 视频管线 → 打磨 UI/多语言与合规页面。
4. 部署到静态托管，验证 `.wasm` MIME、缓存头与 CSP 生效。
5. 回滚：本项目为新增代码，回滚即回退到当前已清空的基线，不影响其他系统。

## Open Questions

- 是否需要「批量图片」模式（多选文件一次处理、zip 下载）？本期不做，接口上 `File[]` 已预留。
- 是否需要自定义遮罩（手动补画漏检人脸）？本期不做，但在 `FaceList` 中预留「手动添加区域」入口位置。
