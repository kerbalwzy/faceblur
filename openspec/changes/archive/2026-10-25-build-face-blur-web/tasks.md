# Tasks

## 1. 工程骨架与资产

- [x] 1.1 用 Vite 初始化 Vue 3 + TypeScript 项目（`package.json`、`vite.config.ts`、`tsconfig`、`index.html`、`src/main.ts`），安装 `vue`、`pinia`、`vue-i18n` 与开发依赖 `vitest`、`@vue/test-utils`、`@playwright/test`；验证：`npm install && npm run dev` 能打开空白首页，`npm run build` 成功产出 `dist/`
- [x] 1.2 安装 `onnxruntime-web`（MIT），编写 `scripts/sync-yunet.mjs` 把 OpenCV Zoo 的 YuNet 模型（MIT）下载到 `public/models/`，同时把模型目录自带的 `LICENSE` 一并复制，并在 `public/models/README.md` 记录上游 URL、引用、SHA256 与许可；实际采用 `face_detection_yunet_2026may.onnx`（224 KB，动态输入）而非 2023mar int8 版——实测后者输入固定 640 且慢 4 倍，详见 design「模型版本选择」；验证：`node scripts/sync-yunet.mjs` 后模型约 224 KB、`LICENSE` 存在且内容为 MIT
- [x] 1.3 编写 `scripts/sync-ort.mjs`，把 `node_modules/onnxruntime-web/dist/` 中 WASM 后端所需的 `.wasm` 与 `.mjs` 复制到 `public/ort/`，并在 `vite.config.ts` 中设置 `ort.env.wasm.wasmPaths = '/ort/'`；验证：`npm run build` 后 `dist/ort/` 内含运行时文件，且构建产物中不包含 WebGPU 与训练相关大文件
- [x] 1.4 配置静态托管细节：`.wasm` MIME（`application/wasm`）、`public/models/*` 与 `public/ort/*` 长缓存、CSP（见 design D11）、记录 COOP/COEP 缺失时的单线程回退说明；验证：`npm run build && npm run preview` 后控制台无 CSP 报错、Network 面板中 ORT 的 `.wasm` 的 Content-Type 为 `application/wasm`
- [x] 1.5 建立商用合规基线：编写 `docs/licenses.md` 登记生产依赖、模型、muxer、字体与图标的许可证，并在 CI 中加入许可证白名单检查（MIT / Apache-2.0 / BSD / ISC / 0BSD，命中以外则在 PR 阶段失败）；验证：`npm run check-licenses` 通过，且人为加入一个 NC 许可的假依赖时该脚本以非零码退出

## 2. 检测引擎（face-detection）

- [x] 2.1 在 `src/engine/detector.ts` 定义 `FaceBox`、`DetectionOptions`、`FaceDetectorClient` 接口与 `letterbox` 映射工具（`src/engine/io/letterbox.ts`）；验证：`vitest` 单测覆盖 letterbox 的等比缩放、居中补边与坐标反变换（含竖图/横图/正方形三种，误差 ≤1px）
- [x] 2.2 实现 `src/engine/io/weight-cache.ts`：IndexedDB 读写 + 首次下载进度回调 + 读取损坏时清除并重下一次；验证：单测用 `fake-indexeddb` 断言二次调用不再发起 fetch、损坏项会重试一次
- [x] 2.3 实现 `src/engine/postprocess/yunet.ts`：对 8/16/32 三个尺度解码 `cls/obj/bbox/kps`，按 `sqrt(cls*obj)` 计算分数、`exp` 解码框宽高、stride 还原关键点，并做 NMS（IoU 0.3）与跨尺度去重；验证：单测用固定的小批量张量输入断言解码坐标、分数与 NMS 结果，并用真实模型跑一张测试图断言 ≥1 张人脸且 `score > 0.6`
- [x] 2.4 实现 module worker `src/engine/worker/detect.worker.ts` 与 `protocol.ts`：加载 ORT 运行时、创建 YuNet 会话（`executionProviders: ['wasm']`）、接收 `ImageBitmap` 后按 design D6 构造 `[1,3,320,320]` NCHW 的 **RGB 0–255** 输入并推理；验证：`vitest` 中在 Node 环境用 `onnxruntime-node` 或浏览器模式跑通同一张图，断言输出桶与后处理结果一致
- [x] 2.5 实现主线程客户端 `src/engine/face-detector.ts`：`ImageBitmap` transferable 传给 Worker、请求排队、`init` 进度上报（runtime/model/session 三阶段）、`dispose`；验证：单测模拟 Worker 断言消息序列与排队行为，浏览器手测检测期间页面可滚动、按钮可点击
- [x] 2.6 加入 SIMD 能力探测、`crossOriginIsolated` 检测与多线程→单线程自动回退，并把不支持原因转换为可读的 UI 状态；验证：用 `vitest` 桩数据覆盖探测失败与回退路径，并在未开启隔离头的部署下手测仍能完成检测
- [x] 2.7 实现可配置检测阈值（默认 0.6）与精度档位：图片可选 320/480/640 并对低置信度区域两阶段裁剪重检后合并去重；视频固定 320 且不暴露分辨率选项（见 design D15）；验证：单测断言阈值提高后结果被过滤且会话未被重建、两阶段合并后同一人脸只保留一个框、视频路径传入高精度参数时被拒绝或忽略；手测小脸照片在高精度档召回提升且 1080p 视频处理耗时不因档位切换而变化
- [x] 2.8 在 `docs/engine.md` 记录检测器契约、YuNet 输入输出语义、阈值策略、多线程条件，以及替换为其他检测器（如 MediaPipe）的适配器步骤；验证：按文档步骤以 mock 适配器走通 2.5 的接口测试，且不修改图片/视频管线

## 3. 图片处理（image-blur）

- [x] 3.1 实现文件导入层：点击/拖拽/粘贴三种入口、格式白名单（JPEG/PNG/WebP）、超大图（>4000 万像素）确认提示、EXIF 方向校正；验证：单测覆盖格式拒绝与 EXIF `Orientation=6` 的宽高互换，手测粘贴导入成功
- [x] 3.2 实现 `src/pipeline/render/mask-shape.ts`：由 bbox + 5 关键点生成外扩遮罩路径（默认圆角矩形、可切椭圆），关键点异常回退 bbox；验证：单测覆盖正脸/侧脸/缺失关键点三种输入，断言遮罩完全包含 bbox 核心区域（上下左右各外扩 ≥5%）
- [x] 3.3 实现 `src/pipeline/render/blur.ts` 三种样式（高斯模糊、马赛克、色块）与强度参数，模糊半径/块大小按素材短边比例计算；验证：单测在合成 canvas 上断言模糊后区域内像素方差显著下降、马赛克输出为块常量、色块像素为指定颜色
- [x] 3.4 实现 `src/pipeline/image-pipeline.ts`：解码 → 检测 → 渲染 → 导出（原分辨率、JPEG/PNG/WebP + 质量、`-blurred` 文件名）；验证：单测导出一张 1200×800 图断言宽高不变且输出文件名正确
- [x] 3.5 实现逐脸开关与「全部应用」、参数调整只重绘不重测、80 ms 防抖重绘与「按住对比原图」；验证：单测断言参数变化时检测器调用次数不变，手测滑块拖动流畅、对比按钮松开即恢复
- [x] 3.6 写图片管线文档 `docs/image.md`（含导出分辨率与模糊半径换算公式）与 Playwright e2e：导入 → 等待检测 → 切换样式 → 导出，断言下载文件名与图片尺寸；验证：`npx playwright test e2e/image.spec.ts` 通过

## 4. 视频处理（video-blur）

- [x] 4.1 实现视频导入与元信息读取（时长/分辨率/帧率/是否可解码），不可解码时给出转码建议；验证：单测覆盖不支持容器的错误分支，手测导入 MP4 显示正确时长
- [x] 4.2 实现 `src/pipeline/video/track.ts`：基于上一帧 IoU + 鼻尖距离的轨迹关联，漏检帧沿用前 3 帧结果；验证：单测构造「第 5 帧漏检」的序列，断言该帧仍输出遮挡且 3 帧后轨迹消失
- [x] 4.3 实现 WebCodecs 解码 + Worker 检测 + OffscreenCanvas 绘制 + 编码导出的主路径（使用 `mp4-muxer`/`webm-muxer`），分辨率与源一致；验证：手测 10 秒 1080p 视频导出后可在系统播放器播放，且画面中的人脸全程被遮挡
- [x] 4.4 实现 MediaRecorder 降级路径（WebCodecs 不可用时）并在 UI 标注「实时录制模式」；验证：在禁用 `VideoEncoder` 的环境下手测能完成导出，UI 显示降级标识
- [ ] 4.5 实现进度上报、取消与资源释放（逐帧 `close()`、限制在途帧 ≤4），音轨在可行时保留；**状态：部分完成（归档时保留未勾选）**；**已完成**：进度上报、取消、资源释放，均有测试覆盖；进度/取消/释放已完成并有测试，**音轨保留未实现**（导出无声音，需 decode→AudioEncoder→muxer 全链路，见 docs/video.md）；验证：单测用桩断言取消后无未关闭帧且任务状态回到可重试，手测 5 分钟视频处理期间内存曲线不随帧数线性增长
- [x] 4.6 写视频管线文档 `docs/video.md`（WebCodecs 与 MediaRecorder 的能力差异、浏览器兼容表）与 Playwright e2e：导入 3 秒短视频 → 处理 → 取消一次 → 重新处理并导出；验证：`npx playwright test e2e/video.spec.ts` 通过

## 5. 界面与隐私承诺（privacy-tool-ui / privacy-local-only）

- [x] 5.1 实现 `stores/session.ts` 状态机（`idle/loading/detecting/ready/rendering/done/error`）与 `stores/prefs.ts`（语言、主题、导出质量，仅这些允许持久化）；验证：单测断言状态迁移合法且素材数据不进入 `localStorage`/IndexedDB
- [x] 5.2 实现页面骨架与组件：`Uploader`、`ImageStage`/`VideoStage`、`FaceList`、`StylePicker`、`ProgressBar`、`Footer`；空状态含格式说明与「素材不会上传」文案，各阶段按钮互斥禁用；验证：组件单测覆盖空状态、检测中禁用、错误态出现重试入口
- [x] 5.3 接入多语言 `zh-CN`/`en`（浏览器语言自动选择、手动切换后持久化）与浅/深色主题（跟随系统 + 手动切换）；验证：单测断言 `zh-CN` UA 默认中文、切换英文后刷新仍为英文
- [x] 5.4 完成响应式布局（≥1024px / ≤480px）与可访问性基础（Tab 焦点可见、图标按钮 `aria-label`）；验证：Playwright 在 390px 视口完成导入→导出流程无横向溢出；axe 检查无 critical 问题
- [x] 5.5 落实隐私可验证性：CSP 收紧、页脚列出 YuNet（MIT）与 onnxruntime-web（MIT）等来源与许可证、`docs/privacy.md` 说明零上传设计；验证：Playwright 监听 `page.on('request')`，断言整个处理流程中除同域静态资源外无业务请求，并断言处理后刷新页面不恢复素材
- [x] 5.6 补充离线可用验证：Service Worker 预缓存静态资源、ORT 运行时与模型，断网后仍能处理新导入的本地图片；验证：手测「在线用一次 → 断网 → 导入图片 → 处理成功」

## 6. 集成与商用发布

- [x] 6.1 全量回归：`npm run typecheck`、`npm run test`、`npx playwright test`、`npm run build`、`npm run check-licenses` 全部通过
- [x] 6.2 用一组真实样本（正脸、侧脸、多人、逆光、小脸、含 EXIF 的竖拍图）做人工验收，记录漏检情况到 `docs/limitations.md`；验证：验收清单每项有结论与截图
- [x] 6.3 编写 `scripts/benchmark.mjs` + 页面内隐藏的 `/bench` 路由，测量并记录：单帧检测耗时（320/480/640）、单帧两阶段检测耗时、图片端到端耗时、1080p 视频处理倍率（处理时长 / 素材时长）、峰值内存；在至少三类设备（现代桌面、5 年旧办公本、中端手机）各跑一次，把结果与 D14 的基线对照后写入 `docs/limitations.md`；验证：三类设备均有实测数据，若实测明显偏离基线则更新 D14 并说明原因
- [x] 6.4 商用合规检查：逐项核对 `docs/licenses.md` 与实际 `node_modules` 生产依赖、`public/models/` 内的 LICENSE 文件一致，确认页面署名与仓库声明一致，且无任何 NC/GPL 条目；验证：审计清单签字式复核，`npm run check-licenses` 与人工核对均通过
- [x] 6.5 编写 `README.md`：项目定位、隐私承诺、技术栈、运行环境基线（引用 design D14）、模型来源与许可证说明（并注明 facex 仅作原理参考、未使用其代码）、本地开发与部署步骤；验证：按 README 从零克隆后能在 3 条命令内跑起来

## Workflow follow-up

- 部署到静态托管（GitHub Pages / Cloudflare Pages），验证 HTTPS 下 ORT 运行时与模型加载、缓存头与 `.wasm` MIME 生效；若托管支持自定义响应头，开启 COOP/COEP 以启用多线程推理。
- 商业化上线前完成一次法律侧复核：模型 LICENSE 原件归档、页脚署名、隐私政策文本与「零上传」实现一致。
- 验收通过后归档本 change。
