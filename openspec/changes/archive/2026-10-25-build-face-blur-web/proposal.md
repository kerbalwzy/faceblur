# Proposal

## Why

现有仓库在上一次提交中删除了全部 Python/FastAPI 版本代码，准备用 TypeScript 重写。同时，人脸隐私打码在自媒体、新闻报道、企业内部素材、二次转发场景中需求稳定，而市面上的同类工具大多把用户原始照片/视频上传到服务器处理，存在泄露风险与信任成本。

我们希望参考 [facex](https://github.com/facex-engine/facex) 的「纯浏览器 WebAssembly 人脸检测」原理，做一个**素材从不上传、纯前端推理**的在线人脸模糊工具，替代旧的本地 Python 方案，并可以直接静态托管。

项目**有明确的商业化计划**，因此从第一行代码起，全部依赖（代码、模型、运行时）MUST 采用允许商用的许可证（MIT / Apache-2.0 / BSD 等）。这一点直接决定了检测器选型：facex 的检测器虽体积小，但其头文件声明为 CC BY-NC-SA 4.0（禁止商用），因此不能采用。

## What Changes

- **BREAKING**：移除旧 Python/Flask 后端方案（已在上次提交删除），改为纯前端 TypeScript 单页应用，无服务端逻辑。
- 新建 Vite + Vue 3 + TypeScript 前端工程，形成「上传 → 检测 → 模糊 → 导出」单页流程。
- 接入 **YuNet 人脸检测模型（OpenCV Zoo，MIT 协议，INT8 量化版仅 100 KB）通过 onnxruntime-web 推理**，在 Web Worker 中加载与运行，主线程不阻塞。选型理由：许可证允许商用、模型体积比 facex 方案更小（100 KB vs 686 KB）、WIDER Easy AP 0.8810 精度更高，且原生输出边界框 + 5 个关键点，与本工具需求完全匹配。
- 图片处理：本地解析、实时预览、多种模糊样式、逐脸/整图开关、参数调节、原尺寸导出。
- 视频处理：本地解码逐帧检测 + 绘制，通过 `MediaRecorder` 或 WebCodecs 导出无水印结果，任务可取消、可显示进度。
- 模型权重与 WASM 二进制随站点静态托管，首次加载后可离线复用（IndexedDB 缓存）。
- 提供降级路径：浏览器不支持 WASM SIMD / onnxruntime-web 时给出明确提示；检测器仍通过适配器接口隔离，便于将来替换或增加自研模型。
- 多语言（中文/英文）与深色主题界面，移动端可用。
- 建立「可商用依赖白名单」纪律：任何新增依赖（npm 包、模型权重、字体、图标）在合入前 MUST 登记许可证，非商用许可一律拒绝。

## Capabilities

### New Capabilities

- `face-detection`：浏览器端人脸检测引擎的加载、缓存、推理与结果坐标语义（含多尺度、无脸、降级行为）。
- `image-blur`：图片素材的导入、人脸区域模糊/马赛克/实心遮挡、参数调节与原质量导出。
- `video-blur`：视频素材的逐帧人脸处理、进度与取消、编码导出。
- `privacy-local-only`：零上传承诺——素材与推理结果不出浏览器、无服务端接口、可离线使用。
- `privacy-tool-ui`：工具界面的交互、状态反馈、错误提示与多语言。

### Modified Capabilities

（无，`openspec/specs/` 当前为空，无既有能力需要变更。）

## Impact

- **代码**：新增 `src/`（Vue 3 + TS 前端）、`public/models/`（YuNet ONNX 权重）、`public/ort/`（onnxruntime-web 的 WASM 运行时文件）；删除已不存在的 Python 目录无需再处理。
- **依赖**：`vue`、`vite`、`typescript`、`vue-i18n`、`pinia`、`onnxruntime-web`（MIT）；模型权重来自 OpenCV Zoo 的 YuNet（MIT）。全部允许商用，无运行时 CDN 依赖。
- **构建与部署**：纯静态产物，可部署到任意静态托管（GitHub Pages / Cloudflare Pages / Vercel）。需要正确的 WASM MIME 类型、跨源隔离头（如需多线程）与缓存头。
- **许可证审计**：
  - **facex 检测器不采用**：其 `include/detect.h` 标注 CC BY-NC-SA 4.0（禁止商用），与仓库根 Apache-2.0 声明冲突，商用场景下风险不可接受。项目文档中仅作为「原理参考」引用，不复制其代码或权重。
  - 本项目选用的全部依赖均允许商用，并在 `docs/licenses.md` 中逐项登记名称、版本、许可证和用途，作为上线前的审计依据。
  - 若将来产出自研模型，其训练数据许可证同样 MUST 纳入审计（例如训练集若含非商用许可数据，产物可能受其约束）。
- **浏览器兼容性**：依赖 WebAssembly SIMD（Chrome 91+ / Firefox 89+ / Safari 16.4+），与 onnxruntime-web 的 WASM 后端要求一致；视频导出依赖 `MediaRecorder` / WebCodecs 支持的容器格式（Safari 下 MP4、Chromium 下 WebM）。
