/**
 * Letterbox 预处理与其逆变换。
 *
 * 检测器需要正方形输入，而素材通常是任意长宽比。做法是等比缩放后居中补边：
 *
 *     s  = detSize / max(W, H)        ← 缩放比
 *     nw = round(W * s), nh = round(H * s)
 *     dx = (detSize - nw) / 2         ← 左/右补边
 *     dy = (detSize - nh) / 2         ← 上/下补边
 *
 * 检测结果在「检测器输入坐标系」中，必须用 toSource 反变换回原始像素坐标，
 * 否则长宽比不为 1 的图片上，框会整体偏移并缩放错误。
 */

export interface LetterboxTransform {
  /** 检测器输入边长 */
  detSize: number
  /** 原始宽高 */
  srcWidth: number
  srcHeight: number
  /** 等比缩放比 */
  scale: number
  /** 缩放后的内容尺寸（落在 detSize 画布内） */
  contentWidth: number
  contentHeight: number
  /** 内容左上角在画布中的偏移（补边宽度） */
  offsetX: number
  offsetY: number
}

/** 计算 letterbox 参数。 */
export function computeLetterbox(srcWidth: number, srcHeight: number, detSize: number): LetterboxTransform {
  if (srcWidth <= 0 || srcHeight <= 0) {
    throw new RangeError(`素材尺寸非法：${srcWidth}x${srcHeight}`)
  }
  if (detSize <= 0) {
    throw new RangeError(`检测尺寸非法：${detSize}`)
  }

  const scale = detSize / Math.max(srcWidth, srcHeight)
  const contentWidth = Math.round(srcWidth * scale)
  const contentHeight = Math.round(srcHeight * scale)

  return {
    detSize,
    srcWidth,
    srcHeight,
    scale,
    contentWidth,
    contentHeight,
    offsetX: (detSize - contentWidth) / 2,
    offsetY: (detSize - contentHeight) / 2,
  }
}

/** 检测器输入坐标 → 素材原始坐标。 */
export function toSourceX(t: LetterboxTransform, x: number): number {
  return (x - t.offsetX) / t.scale
}

export function toSourceY(t: LetterboxTransform, y: number): number {
  return (y - t.offsetY) / t.scale
}

/** 素材原始坐标 → 检测器输入坐标。 */
export function toDetectorX(t: LetterboxTransform, x: number): number {
  return x * t.scale + t.offsetX
}

export function toDetectorY(t: LetterboxTransform, y: number): number {
  return y * t.scale + t.offsetY
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** 把检测坐标系中的矩形映射回素材坐标，并裁剪到素材范围。 */
export function rectToSource(t: LetterboxTransform, r: Rect): Rect {
  const x1 = Math.max(0, toSourceX(t, r.x))
  const y1 = Math.max(0, toSourceY(t, r.y))
  const x2 = Math.min(t.srcWidth, toSourceX(t, r.x + r.width))
  const y2 = Math.min(t.srcHeight, toSourceY(t, r.y + r.height))
  return { x: x1, y: y1, width: Math.max(0, x2 - x1), height: Math.max(0, y2 - y1) }
}

/**
 * 素材上「短边过小」时的上采样倍数。
 *
 * YuNet 的官方训练目标是 10–300 px 的人脸；一张短边只有几十像素的图，
 * 直接 letterbox 后小脸会落到 10px 以下而检不到。这里先放大再检测，
 * 检测结果仍按原始坐标返回（scale 已包含放大倍数）。
 */
export const MIN_DETECT_SHORT_SIDE = 160

export function computeUpscale(srcWidth: number, srcHeight: number): number {
  const shortSide = Math.min(srcWidth, srcHeight)
  if (shortSide <= 0) return 1
  return shortSide < MIN_DETECT_SHORT_SIDE ? MIN_DETECT_SHORT_SIDE / shortSide : 1
}
