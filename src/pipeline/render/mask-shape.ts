/**
 * 由检测结果生成遮挡区域。
 *
 * 为什么不能只用边界框矩形：检测框通常只包住脸颊，不包含额头与下巴，
 * 直接用框会「露下巴 / 露额头」。同类工具最常见的缺陷就是这个。
 *
 * 策略：
 *   1. 以 5 个关键点估算面部主轴（两眼连线）与脸部尺度；
 *   2. 沿主轴生成旋转椭圆或圆角矩形；
 *   3. 外扩边距，向上多扩（额头），向下适度（下巴）。
 */
import type { FaceBox } from '@/engine/detector'

export type MaskShape = 'rounded' | 'ellipse'

export interface MaskParams {
  /** 形状 */
  shape?: MaskShape
  /** 水平外扩比例（相对人脸宽度） */
  paddingX?: number
  /** 垂直外扩比例（相对人脸高度） */
  paddingY?: number
  /** 向上额外扩张比例（覆盖额头） */
  paddingTop?: number
}

const DEFAULTS: Required<MaskParams> = {
  shape: 'rounded',
  paddingX: 0.12,
  paddingY: 0.18,
  paddingTop: 0.1,
}

export interface MaskGeometry {
  /** 中心点 */
  cx: number
  cy: number
  /** 半轴长（已含外扩） */
  rx: number
  ry: number
  /** 主轴旋转角（弧度），由两眼连线决定 */
  angle: number
  /** 外形，供渲染层选择路径生成方式 */
  shape: MaskShape
}

/** 关键点是否可用（数量足够、数值有限、间距合理）。 */
export function hasUsableKeypoints(face: FaceBox): boolean {
  if (!Array.isArray(face.kps) || face.kps.length < 5) return false
  for (const p of face.kps) {
    if (!Array.isArray(p) || p.length < 2) return false
    if (!Number.isFinite(p[0]) || !Number.isFinite(p[1])) return false
  }
  // 两眼不能重合
  const dx = face.kps[1][0] - face.kps[0][0]
  const dy = face.kps[1][1] - face.kps[0][1]
  return Math.hypot(dx, dy) > 1
}

/**
 * 计算遮挡几何。
 *
 * 有可用关键点时用两眼连线定角度；否则退回轴对齐矩形（角度 0）。
 */
export function computeMask(face: FaceBox, params: MaskParams = {}): MaskGeometry {
  const p = { ...DEFAULTS, ...params }

  const cxBase = face.x + face.width / 2
  const cyBase = face.y + face.height / 2

  let angle = 0
  if (hasUsableKeypoints(face)) {
    const [rightEye, leftEye] = face.kps
    // 画面 y 轴向下，角度取负号保证椭圆随头部倾斜方向正确
    angle = Math.atan2(leftEye[1] - rightEye[1], leftEye[0] - rightEye[0])
  }

  // 外扩：宽度按比例，高度上下不同（额头多扩）
  const rx = (face.width * (1 + p.paddingX * 2)) / 2
  const ryTop = face.height * (1 + p.paddingY + p.paddingTop)
  const ryBottom = face.height * (1 + p.paddingY)
  const ry = (ryTop + ryBottom) / 4 // 取平均半轴，配合中心下移

  // 中心沿主轴下移一点，让额头覆盖更多、下巴适度
  const shift = (ryBottom - ryTop) / 4
  const cy = cyBase + shift * Math.cos(angle)
  const cx = cxBase + shift * Math.sin(angle)

  return { cx, cy, rx, ry, angle, shape: p.shape }
}

/** 遮罩的外接矩形（供渲染层确定重绘范围）。 */
export function maskBounds(m: MaskGeometry): { x: number; y: number; width: number; height: number } {
  // 旋转椭圆的包围盒
  const cos = Math.cos(m.angle)
  const sin = Math.sin(m.angle)
  const halfW = Math.sqrt((m.rx * cos) ** 2 + (m.ry * sin) ** 2)
  const halfH = Math.sqrt((m.rx * sin) ** 2 + (m.ry * cos) ** 2)
  return {
    x: m.cx - halfW,
    y: m.cy - halfH,
    width: halfW * 2,
    height: halfH * 2,
  }
}

/**
 * 把遮罩写入 canvas 路径（调用方负责 beginPath / fill / clip）。
 */
export function addMaskPath(ctx: {
  ellipse: (x: number, y: number, rx: number, ry: number, rotation: number, s: number, e: number) => void
  roundRect?: (x: number, y: number, w: number, h: number, r: number | number[]) => void
  arcTo: (x1: number, y1: number, x2: number, y2: number, r: number) => void
  moveTo: (x: number, y: number) => void
  lineTo: (x: number, y: number) => void
}, m: MaskGeometry): void {
  if (m.shape === 'ellipse') {
    ctx.ellipse(m.cx, m.cy, m.rx, m.ry, m.angle, 0, Math.PI * 2)
    return
  }

  // 圆角矩形：沿主轴旋转，用 arcTo 生成真正的圆角
  const w = m.rx * 2
  const h = m.ry * 2
  const r = Math.min(w, h) * 0.28

  const cos = Math.cos(m.angle)
  const sin = Math.sin(m.angle)
  const rotate = (x: number, y: number): [number, number] => [
    m.cx + x * cos - y * sin,
    m.cy + x * sin + y * cos,
  ]

  const hw = w / 2
  const hh = h / 2

  // 从左边中点开始，顺时针依次经过四个角（局部坐标系）
  const start = rotate(-hw, 0)
  ctx.moveTo(start[0], start[1])

  const corners: Array<[number, number, number, number]> = [
    // [角点, 进入点, 离开点]：用局部坐标描述
    [-hw, -hh, hw, -hh],
    [hw, -hh, hw, hh],
    [hw, hh, -hw, hh],
    [-hw, hh, -hw, -hh],
  ]
  for (const [cxLocal, cyLocal, nx, ny] of corners) {
    const [ax, ay] = rotate(cxLocal, cyLocal)
    const [bx, by] = rotate(nx, ny)
    ctx.arcTo(ax, ay, bx, by, r)
  }
  ctx.lineTo(start[0], start[1])
}
