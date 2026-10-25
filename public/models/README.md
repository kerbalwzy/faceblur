# 模型资产

本目录下的文件由 `npm run sync:yunet` 从上游同步而来，请勿手工修改。

| 文件 | 用途 | 体积 | SHA256 |
|---|---|---|---|
| `yunet.onnx` | 人脸检测模型（FP32，动态输入） | 229738 B | `ebafce4e3c118d6554634be5c27ab333b4c047a9a8c3faf1d7cf93101c22f0f0` |
| `LICENSE` | 模型许可证 | 1085 B | `c83b8120c50ccbd4c4f96edf53141bdd566ebb8f8e9227e415326aa1b1aba958` |

## 来源

- 仓库：https://github.com/opencv/opencv_zoo
- 路径：`models/face_detection_yunet`
- 引用：`main`
- 原始文件名：`face_detection_yunet_2026may.onnx`
- 下载地址：https://media.githubusercontent.com/media/opencv/opencv_zoo/main/models/face_detection_yunet/face_detection_yunet_2026may.onnx

## 许可证

MIT —— 允许商业使用。原始许可证文件见同目录下的 `LICENSE`，完整依赖清单见 `docs/licenses.md`。

## 模型说明

YuNet 是轻量人脸检测模型，输出边界框与 5 个人脸关键点（右眼、左眼、鼻尖、右嘴角、左嘴角）。
输入为 1×3×H×W 的 RGB 图像张量（取值 0–255），输出 8/16/32 三个尺度的 `cls`/`obj`/`bbox`/`kps`。

论文：Wu, Peng, Yu. *YuNet: A Tiny Millisecond-level Face Detector*, Machine Intelligence Research, 2023.
