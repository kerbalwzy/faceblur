# 检测引擎

本文记录人脸检测层的契约、实现细节与替换方法。

## 一句话架构

```
主线程 FaceDetector ──postMessage(ImageBitmap)──▶ Worker
     ▲                                              │
     └──── FaceBox[]（素材原始坐标）─────────────────┘
                                       │
                            ORT(WASM) + YuNet 推理
```

推理全部发生在 Web Worker 中，主线程只收发消息，因此处理长视频时 UI 不卡顿（`specs/face-detection`「推理不阻塞主线程」）。

## 契约

上层（图片/视频管线）只依赖 `src/engine/detector.ts`：

```ts
export interface FaceDetectorClient {
  init(onProgress?: (p: DetectionProgress) => void): Promise<void>
  detect(bitmap: ImageBitmap, opts?: DetectionOptions): Promise<FaceBox[]>
  dispose(): Promise<void>
  readonly runtime: DetectorRuntimeInfo | null
}

export interface FaceBox {
  x: number; y: number; width: number; height: number   // 素材原始像素坐标
  score: number                                          // 0–1
  kps: Array<[number, number]>                           // 右眼、左眼、鼻尖、右嘴角、左嘴角
}
```

**关键约定**：

- `FaceBox` 的坐标是**素材原始像素坐标**，不是检测器输入坐标；
- 矩形与关键点**来自同一套变换**，因此必定自洽（关键点落在框内）；
- 越界部分不做裁剪，由渲染层按素材尺寸处理（这样框和关键点不会互相矛盾）。

## 模型

| 项 | 值 |
|---|---|
| 文件 | `public/models/yunet.onnx`（`face_detection_yunet_2026may.onnx`） |
| 来源 | [OpenCV Zoo](https://github.com/opencv/opencv_zoo/tree/main/models/face_detection_yunet) |
| 许可证 | MIT |
| 体积 | 224 KB |
| 输入 | `input`，NCHW `[1,3,H,W]`，**RGB，取值 0–255** |
| 输出 | `cls_8/16/32`、`obj_8/16/32`、`bbox_8/16/32`、`kps_8/16/32` |

### 为什么不用 int8 版本

实测（Chromium + onnxruntime-web 1.30）：

| 模型 | 输入 | 320 | 640 | 结论 |
|---|---|---|---|---|
| `2023mar_int8` | 固定 640 | ❌ | 37.8 ms | 不可用 |
| `2023mar_int8bq` | 固定 640 | ❌ | 加载失败 | 不可用 |
| **`2026may`** | **动态** | **4.2 ms** | **9.6 ms** | 采用 |

`2026may` 支持任意分辨率，且比 int8 固定 640 快约 4 倍。

## 预处理

按 YuNet 官方 demo 实现：

1. 等比缩放让长边贴到 `detSize`，居中补边（颜色 `114`）；
2. 像素保持 **0–255 的浮点**，**不做** `[-1,1]` 归一化；
3. 通道顺序 **RGB**（不是 OpenCV 常见的 BGR）；
4. 布局 NCHW。

> ⚠️ 网上很多示例（包括上游 facex 的 SDK 注释）写的是 `[-1,1]` 归一化，那是**错的**，会导致检测失效。

短边小于 160px 的图片会先放大再检测，避免小脸低于模型可检范围。

## 后处理

```
score = sqrt(cls * obj)
cx = (col + bbox[0]) * stride
cy = (row + bbox[1]) * stride
w  = exp(bbox[2]) * stride        ← 对数尺度，最容易写错
h  = exp(bbox[3]) * stride
kps_x = (col + kps[2k])     * stride
kps_y = (row + kps[2k + 1]) * stride
```

之后：

1. **过滤** `score <= 0`（背景网格）与低于 `minScore` 的结果；
2. **跨尺度合并**：IoU > 0.3 或 5 点平均距离 < 脸尺寸 12% 时视为同一张脸，保留高分；
3. **NMS**：IoU 阈值 0.3。

## 精度与速度的取舍

详见 design D15。实现落点为 `src/engine/strategy.ts`：

| 场景 | 首轮尺寸 | 两阶段重检 |
|---|---|---|
| 图片 · 标准 | 320 | ✅ |
| 图片 · 高精度 | 640 | ✅ |
| **视频** | **固定 320** | ❌ |

**视频为什么不提档**：逐帧处理下 640 是 320 的约 4 倍计算量，会让 1 分钟视频的处理时间从约 20 秒涨到 80 秒以上。视频的精度提升只通过阈值调节实现。

**默认阈值 0.6**：对面部打码工具而言，误把背景（画作、物体）当成脸糊掉，比漏掉一张脸更伤体验。

## 运行时与加载

1. **必须用 `ort.wasm.min.mjs` 入口**（仅 WASM 后端约 50 KB）。默认入口会去找 27 MB 的 WebGPU（jsep）变体。
2. WASM 胶水与二进制通过 Vite 别名 + `?url` 加载（`src/engine/ort-glue.ts`）。**不能**从 `public/` 动态 import，dev 服务器会拒绝。
3. 权重缓存在 IndexedDB（`src/engine/io/weight-cache.ts`），二次访问不再下载。
4. 多线程需要 `crossOriginIsolated`（COOP/COEP 响应头）；不具备时自动退化为单线程，功能不受影响。

## 已知限制

- 极小脸（长边 < 10px）无法检出，这是模型训练范围决定的；
- 侧脸超过约 75°、严重遮挡、逆光过曝时会漏检；
- `maxFaces` 层面没有硬上限，但实际受 NMS 与置信度过滤约束；
- 重检最多处理前 8 张小脸，防止群照耗时失控。

## 如何替换检测器

1. 新建 `src/engine/xxx-detector.ts`，实现 `FaceDetectorClient`；
2. 保证 `detect` 返回**素材原始坐标**的 `FaceBox`；
3. 在调用处替换 `new FaceDetector()` 为 `new XxxDetector()`；
4. 跑 `tests/e2e/detector.spec.ts`（它只依赖契约，不依赖具体模型）。

图片与视频管线**无需任何修改**——它们只认 `FaceBox`。
