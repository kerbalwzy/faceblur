/**
 * YuNet 后处理：把多尺度原始输出解码成人脸框 + 关键点。
 *
 * 官方解码公式（与 OpenCV Zoo demo 一致）：
 *   score = sqrt(cls * obj)                     ← 最终置信度
 *   cx = (col + bbox[0]) * stride
 *   cy = (row + bbox[1]) * stride
 *   w  = exp(bbox[2]) * stride
 *   h  = exp(bbox[3]) * stride
 *   kps_x = (col + kps[2k])     * stride
 *   kps_y = (row + kps[2k + 1]) * stride
 *
 * 注意：bbox 与 kps 都是相对网格单元的**归一化**偏移，必须乘以 stride；
 * 宽度用 exp 解码（对数尺度），这是最容易写错的地方。
 */
import type { Keypoint } from '../detector'
import type { Rect } from '../io/letterbox'

/** YuNet 的 8/16/32 三个尺度。 */
export const STRIDES = [8, 16, 32] as const
export type Stride = (typeof STRIDES)[number]

/** 单个尺度上的原始张量。 */
export interface ScaleTensors {
  stride: Stride
  /** [1, N, 1] */
  cls: Float32Array
  /** [1, N, 1] */
  obj: Float32Array
  /** [1, N, 4] */
  bbox: Float32Array
  /** [1, N, 10] */
  kps: Float32Array
  /** 该尺度的网格宽度（detSize / stride） */
  cols: number
  /** 该尺度的网格高度（detSize / stride） */
  rows: number
}

/** 解码出的单个人脸（检测器输入坐标系）。 */
export interface RawFace {
  rect: Rect
  score: number
  kps: Keypoint[]
  stride: Stride
}

export interface DecodeOptions {
  /** 最低置信度（含），默认 0.6 */
  minScore?: number
  /** NMS 的 IoU 阈值，默认 0.3 */
  nmsIou?: number
  /** 跨尺度去重的 IoU 阈值，默认 0.3 */
  mergeIou?: number
  /** 过小的框直接丢弃（像素，默认 4） */
  minBoxSize?: number
}

const DEFAULT_DECODE: Required<DecodeOptions> = {
  minScore: 0.6,
  nmsIou: 0.3,
  mergeIou: 0.3,
  minBoxSize: 4,
}

function sqrtScore(cls: number, obj: number): number {
  // 两侧都做 sigmoid 前的原始值域通常是 [0,1]（模型已带 sigmoid）；夹紧防止 NaN
  const v = cls * obj
  if (!Number.isFinite(v) || v <= 0) return 0
  return Math.sqrt(v)
}

/** 解码单个尺度。 */
export function decodeScale(t: ScaleTensors, opts: DecodeOptions = {}): RawFace[] {
  const { minScore, minBoxSize } = { ...DEFAULT_DECODE, ...opts }
  const { stride, cols, rows, cls, obj, bbox, kps } = t
  const n = cols * rows
  const out: RawFace[] = []

  for (let i = 0; i < n; i++) {
    const score = sqrtScore(cls[i], obj[i])
    // 分数为 0 表示该网格没有检测（背景），即使 minScore=0 也必须跳过，
    // 否则空网格会产出成千上万个「人脸」。
    if (score <= 0 || score < minScore) continue

    const col = i % cols
    const row = (i - col) / cols

    const cx = (col + bbox[i * 4]) * stride
    const cy = (row + bbox[i * 4 + 1]) * stride
    // exp 解码：模型输出的是对数尺度
    const w = Math.exp(bbox[i * 4 + 2]) * stride
    const h = Math.exp(bbox[i * 4 + 3]) * stride

    if (!Number.isFinite(w) || !Number.isFinite(h)) continue
    if (w < minBoxSize || h < minBoxSize) continue

    const rect: Rect = { x: cx - w / 2, y: cy - h / 2, width: w, height: h }

    const points: Keypoint[] = []
    for (let k = 0; k < 5; k++) {
      points.push([(col + kps[i * 10 + k * 2]) * stride, (row + kps[i * 10 + k * 2 + 1]) * stride])
    }

    out.push({ rect, score, kps: points, stride })
  }

  return out
}

/** IoU（交并比）。 */
export function iou(a: Rect, b: Rect): number {
  const x1 = Math.max(a.x, b.x)
  const y1 = Math.max(a.y, b.y)
  const x2 = Math.min(a.x + a.width, b.x + b.width)
  const y2 = Math.min(a.y + a.height, b.y + b.height)
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1)
  if (inter <= 0) return 0
  const union = a.width * a.height + b.width * b.height - inter
  return union > 0 ? inter / union : 0
}

/** 按分数降序做 NMS。 */
export function nms(faces: RawFace[], iouThreshold: number): RawFace[] {
  const sorted = [...faces].sort((a, b) => b.score - a.score)
  const kept: RawFace[] = []

  for (const f of sorted) {
    let suppressed = false
    for (const k of kept) {
      if (iou(f.rect, k.rect) > iouThreshold) {
        suppressed = true
        break
      }
    }
    if (!suppressed) kept.push(f)
  }
  return kept
}

/** 两脸关键点的平均欧氏距离，用于跨尺度去重（同一张脸在不同尺度上框会很接近）。 */
function keypointDistance(a: RawFace, b: RawFace): number {
  let sum = 0
  for (let i = 0; i < 5; i++) {
    const dx = a.kps[i][0] - b.kps[i][0]
    const dy = a.kps[i][1] - b.kps[i][1]
    sum += Math.hypot(dx, dy)
  }
  return sum / 5
}

/**
 * 合并多个尺度并去重。
 *
 * 两个判断条件（满足其一即视为同一张脸，保留分数更高的）：
 *   1. IoU > mergeIou
 *   2. 5 个关键点平均距离 < 该脸尺寸的 12%（处理「大框套小框但 IoU 不高」的情况）
 */
export function mergeScales(all: RawFace[], opts: DecodeOptions = {}): RawFace[] {
  const { mergeIou } = { ...DEFAULT_DECODE, ...opts }
  const sorted = [...all].sort((a, b) => b.score - a.score)
  const kept: RawFace[] = []

  for (const f of sorted) {
    const size = Math.min(f.rect.width, f.rect.height)
    const kpThreshold = Math.max(2, size * 0.12)

    const duplicate = kept.some((k) => {
      if (iou(f.rect, k.rect) > mergeIou) return true
      return keypointDistance(f, k) < kpThreshold
    })

    if (!duplicate) kept.push(f)
  }
  return kept
}

/**
 * 完整后处理：逐尺度解码 → 合并 → NMS。
 *
 * @param scales 三个尺度的张量
 * @returns 检测器输入坐标系下的人脸列表，按分数降序
 */
export function postprocess(scales: ScaleTensors[], opts: DecodeOptions = {}): RawFace[] {
  const { nmsIou, mergeIou } = { ...DEFAULT_DECODE, ...opts }

  const all: RawFace[] = []
  for (const s of scales) all.push(...decodeScale(s, opts))

  // 先跨尺度合并（去掉同一张脸的重复检测），再做 NMS 清理残余重叠
  const merged = mergeScales(all, { ...opts, mergeIou })
  return nms(merged, nmsIou)
}
