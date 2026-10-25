# 依赖许可证清单

本项目**有商业化计划**，因此所有依赖（代码、模型权重、运行时、字体、图标）必须允许商业使用。

> 本文件由人工维护，并由 `npm run check-licenses` 在 CI 中自动校验。
> 新增任何依赖或模型前，请先在此登记，再提交 PR。

## 校验方式

```bash
npm run check-licenses
```

- 扫描 `package.json` 的 `dependencies` 及其全部传递依赖；
- 检查 `public/models/` 下的模型资产是否附带 `LICENSE` 与 `README.md`；
- 命中 NC / GPL / AGPL / LGPL / SSPL / BUSL / Commons Clause 时**以非零码退出**。

## 允许的许可证白名单

`MIT`、`Apache-2.0`、`BSD-2-Clause`、`BSD-3-Clause`、`ISC`、`0BSD`、`CC0-1.0`、`Unlicense`、`BlueOak-1.0.0`、`MPL-2.0`、`Python-2.0`

## 生产依赖

| 包 | 版本 | 许可证 | 用途 |
|---|---|---|---|
| `vue` | 3.5.x | MIT | 前端框架 |
| `pinia` | 4.x | MIT | 状态管理 |
| `vue-i18n` | 11.x | MIT | 国际化 |
| `onnxruntime-web` | 1.30.x | MIT | 浏览器端 ONNX 推理（WASM 后端） |
| `mp4-muxer` | 5.2.x | MIT | MP4 容器封装（视频导出主路径） |
| `webm-muxer` | 5.1.x | MIT | WebM 容器封装（视频导出备选路径） |
| `onnxruntime-common` | 1.30.x | MIT | ORT 公共类型（传递依赖） |
| `@intlify/*` | 11.x | MIT | vue-i18n 的运行时依赖 |
| `long` / `flatbuffers` / `protobufjs` 等 | — | Apache-2.0 / BSD-3-Clause | ORT 的 protobuf 相关传递依赖 |

完整列表以 `npm run check-licenses` 的输出为准。

## 模型资产

| 资产 | 来源 | 许可证 | 说明 |
|---|---|---|---|
| `public/models/yunet.onnx` | [OpenCV Zoo](https://github.com/opencv/opencv_zoo) `models/face_detection_yunet/face_detection_yunet_2026may.onnx` | **MIT** | 人脸检测模型，224 KB，动态输入尺寸 |
| `public/models/LICENSE` | 同上 | MIT | 原始许可证文件（随模型一并归档） |

模型文件的 SHA256 登记在 `public/models/README.md`，由 `npm run sync:yunet` 生成。

**训练数据**：YuNet 由论文作者（Shiqi Yu 等）在 WIDER FACE 等公开数据集上训练，模型本身以 MIT 发布，允许商用。若将来替换为自研模型，其训练数据许可证同样需要重新审计。

## 运行时资产

| 资产 | 来源 | 许可证 |
|---|---|---|
| `public/ort/ort-wasm-simd-threaded.wasm` | `onnxruntime-web@1.30.x` | MIT |
| `public/ort/ort-wasm-simd-threaded.mjs` | 同上 | MIT |

## 不采用的依赖（记录原因）

| 项目 | 许可证 | 原因 |
|---|---|---|
| facex 检测器（`include/detect.h`） | **CC BY-NC-SA 4.0** | 禁止商业使用；与仓库根 README 声明的 Apache-2.0 冲突。仅作为「纯前端 WASM 人脸检测」的原理参考，**未使用其任何代码或权重** |
| `2023mar_int8.onnx` / `int8bq.onnx` | MIT（许可合规） | 许可没问题，但实测输入固定 640×640 且慢 4 倍，`int8bq` 在 ORT WASM 后端加载失败，故不采用 |

## 字体与图标

- 界面字体使用系统字体栈（`-apple-system` / `Segoe UI` / `PingFang SC` 等），**不内嵌任何字体文件**，避免字体授权问题。
- 图标为项目内联 SVG，原创，随项目以 MIT 发布。

## 上线前复核清单

- [x] `npm run check-licenses` 通过（CI 已强制）—— 当前 58 个生产依赖全部通过
- [x] 生产依赖仅 6 个，全部 MIT
- [x] 模型 LICENSE 已随仓库归档（`public/models/LICENSE`）
- [x] 页脚展示模型与运行时来源
- [ ] 若引入新的模型或字体，重新走一遍本清单
- [ ] `docs/licenses.md` 与 `package.json`、`public/models/` 实际内容一致
- [ ] `public/models/LICENSE` 与 `public/ort/.version` 均在仓库中
- [ ] 页面页脚展示模型与运行时来源及许可证
- [ ] 若引入新的模型或字体，已重新走一遍本清单
