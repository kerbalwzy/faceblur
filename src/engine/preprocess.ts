/**
 * 把 RGBA 像素转成 YuNet 需要的输入张量。
 *
 * YuNet 输入规格（已实测确认）：
 *   - 布局 NCHW：[1, 3, H, W]
 *   - 通道顺序 **RGB**
 *   - 取值 **0–255 的浮点**，不做 [-1,1] 归一化
 *   - 正方形输入，等比缩放后居中补边，补边色为 114（OpenCV 惯例）
 *
 * 注意：上游 facex 的 SDK 注释写的是 `[-1,1]` 归一化，但那是错的（与 C 实现不符）。
 * 这里按 OpenCV Zoo 官方 demo 的预处理实现。
 */
import type { LetterboxTransform } from './io/letterbox'

/** 补边颜色：YuNet / OpenCV 使用的中性灰。 */
export const PAD_VALUE = 114

/**
 * 从源图 canvas 的数据构建 NCHW 张量。
 *
 * @param rgba   源图 RGBA 像素（长度 = srcWidth * srcHeight * 4）
 * @param lb     letterbox 参数（决定输出尺寸与补边位置）
 * @returns 长度为 3 * detSize * detSize 的 Float32Array
 */
export function buildInputTensor(
  rgba: Uint8ClampedArray,
  lb: LetterboxTransform,
): Float32Array {
  const { detSize, contentWidth, contentHeight, offsetX, offsetY, srcWidth, srcHeight } = lb
  const planeSize = detSize * detSize
  const tensor = new Float32Array(3 * planeSize)

  // 先整体填成补边色
  tensor.fill(PAD_VALUE, 0, planeSize * 3)

  // 逐像素双线性采样，比最近的 drawImage 缩放在小图上更稳
  for (let dy = 0; dy < contentHeight; dy++) {
    for (let dx = 0; dx < contentWidth; dx++) {
      // 目标网格中心 → 源坐标
      const sx = ((dx + 0.5) / lb.scale) - 0.5
      const sy = ((dy + 0.5) / lb.scale) - 0.5

      const x0 = Math.floor(sx)
      const y0 = Math.floor(sy)
      const fx = sx - x0
      const fy = sy - y0

      const cx0 = clamp(x0, 0, srcWidth - 1)
      const cx1 = clamp(x0 + 1, 0, srcWidth - 1)
      const cy0 = clamp(y0, 0, srcHeight - 1)
      const cy1 = clamp(y0 + 1, 0, srcHeight - 1)

      let r = 0
      let g = 0
      let b = 0

      for (let k = 0; k < 4; k++) {
        const px = k === 0 || k === 2 ? cx0 : cx1
        const py = k < 2 ? cy0 : cy1
        const w = (k === 0 || k === 2 ? 1 - fx : fx) * (k < 2 ? 1 - fy : fy)
        if (w === 0) continue
        const o = (py * srcWidth + px) * 4
        r += rgba[o] * w
        g += rgba[o + 1] * w
        b += rgba[o + 2] * w
      }

      const oy = dy + offsetY
      const ox = dx + offsetX
      if (oy < 0 || oy >= detSize || ox < 0 || ox >= detSize) continue
      const idx = oy * detSize + ox

      tensor[idx] = r
      tensor[planeSize + idx] = g
      tensor[planeSize * 2 + idx] = b
    }
  }

  return tensor
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

/** 模型输出的张量名（与实测一致）。 */
export const OUTPUT_NAMES = {
  cls: ['cls_8', 'cls_16', 'cls_32'],
  obj: ['obj_8', 'obj_16', 'obj_32'],
  bbox: ['bbox_8', 'bbox_16', 'bbox_32'],
  kps: ['kps_8', 'kps_16', 'kps_32'],
} as const

/** 模型输入名。 */
export const INPUT_NAME = 'input'
