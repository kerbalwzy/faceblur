/**
 * 视频帧间人脸关联：抑制逐帧抖动与漏检导致的闪烁。
 *
 * 问题：逐帧独立检测会因为光照、运动模糊偶尔漏检或轻微跳位，
 * 直接渲染会让遮挡区域「忽大忽小、时有时无」。
 *
 * 策略（最简 SORT 风格，不引入依赖）：
 *   1. 用 IoU + 中心距离把本帧检测结果与上一帧的轨迹配对；
 *   2. 未配对的旧轨迹保留若干帧（用最后一次的位置），超过 TTL 才丢弃；
 *   3. 已配对的轨迹用平滑插值输出，减少抖动。
 */

import type { FaceBox } from '@/engine/detector'

export interface Track {
  id: number
  box: FaceBox
  /** 上一次真实检测到的帧号 */
  lastSeen: number
  /** 连续未检出次数 */
  missed: number
}

export interface TrackerOptions {
  /** 配对所需的最小 IoU（默认 0.2） */
  minIou?: number
  /** 中心点距离阈值，按人脸尺寸归一化（默认 0.6） */
  maxCenterDistance?: number
  /** 漏检后最多保留几帧（默认 3） */
  maxMissed?: number
  /** 位置平滑系数 0–1，越大越跟随新检测（默认 0.6） */
  smoothing?: number
}

const DEFAULTS: Required<TrackerOptions> = {
  minIou: 0.2,
  maxCenterDistance: 0.6,
  maxMissed: 3,
  smoothing: 0.6,
}

function center(f: FaceBox): [number, number] {
  return [f.x + f.width / 2, f.y + f.height / 2]
}

function iou(a: FaceBox, b: FaceBox): number {
  const x1 = Math.max(a.x, b.x)
  const y1 = Math.max(a.y, b.y)
  const x2 = Math.min(a.x + a.width, b.x + b.width)
  const y2 = Math.min(a.y + a.height, b.y + b.height)
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1)
  if (inter <= 0) return 0
  const union = a.width * a.height + b.width * b.height - inter
  return union > 0 ? inter / union : 0
}

/** 归一化中心距离：距离 / 平均脸宽。 */
function normalizedDistance(a: FaceBox, b: FaceBox): number {
  const [ax, ay] = center(a)
  const [bx, by] = center(b)
  const dist = Math.hypot(ax - bx, ay - by)
  const scale = Math.max(1, (a.width + b.width) / 2)
  return dist / scale
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function smoothBox(prev: FaceBox, next: FaceBox, t: number): FaceBox {
  return {
    x: lerp(prev.x, next.x, t),
    y: lerp(prev.y, next.y, t),
    width: lerp(prev.width, next.width, t),
    height: lerp(prev.height, next.height, t),
    score: next.score,
    kps: next.kps.map(([x, y], i) => [
      lerp(prev.kps?.[i]?.[0] ?? x, x, t),
      lerp(prev.kps?.[i]?.[1] ?? y, y, t),
    ]) as FaceBox['kps'],
  }
}

export class FaceTracker {
  private tracks: Track[] = []
  private nextId = 1
  private frameIndex = 0
  private readonly opts: Required<TrackerOptions>

  constructor(options: TrackerOptions = {}) {
    this.opts = { ...DEFAULTS, ...options }
  }

  /** 处理一帧检测结果，返回经平滑/补全后应渲染的人脸。 */
  update(detections: FaceBox[]): FaceBox[] {
    this.frameIndex++
    const { minIou, maxCenterDistance, maxMissed, smoothing } = this.opts

    const used = new Set<number>()
    const result: Track[] = []

    // 1. 为每个已有轨迹找最匹配的新检测
    for (const track of this.tracks) {
      let bestIdx = -1
      let bestCost = Infinity

      for (let i = 0; i < detections.length; i++) {
        if (used.has(i)) continue
        const d = detections[i]
        const overlap = iou(track.box, d)
        const dist = normalizedDistance(track.box, d)
        if (overlap < minIou && dist > maxCenterDistance) continue

        // 代价：重叠越高越小，距离越近越小
        const cost = (1 - overlap) + dist
        if (cost < bestCost) {
          bestCost = cost
          bestIdx = i
        }
      }

      if (bestIdx >= 0) {
        used.add(bestIdx)
        const d = detections[bestIdx]
        result.push({
          id: track.id,
          box: smoothBox(track.box, d, smoothing),
          lastSeen: this.frameIndex,
          missed: 0,
        })
      } else if (track.missed < maxMissed) {
        // 2. 漏检但仍在容忍期内：沿用上一次位置
        result.push({ ...track, missed: track.missed + 1 })
      }
      // 超过 maxMissed 的轨迹被丢弃
    }

    // 3. 未匹配的检测开启新轨迹
    for (let i = 0; i < detections.length; i++) {
      if (used.has(i)) continue
      result.push({
        id: this.nextId++,
        box: detections[i],
        lastSeen: this.frameIndex,
        missed: 0,
      })
    }

    this.tracks = result
    return result.map((t) => t.box)
  }

  /** 当前轨迹数量（调试/测试用）。 */
  get size(): number {
    return this.tracks.length
  }

  reset(): void {
    this.tracks = []
    this.frameIndex = 0
    this.nextId = 1
  }
}
