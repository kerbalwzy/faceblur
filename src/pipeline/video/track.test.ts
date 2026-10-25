import { describe, expect, it } from 'vitest'
import { FaceTracker } from '@/pipeline/video/track'
import type { FaceBox } from '@/engine/detector'

const face = (x: number, y = 100, w = 60, h = 80): FaceBox => ({
  x,
  y,
  width: w,
  height: h,
  score: 0.9,
  kps: Array.from({ length: 5 }, (_, i) => [x + w / 2, y + h / 2 + i] as [number, number]),
})

describe('漏检补全', () => {
  it('单帧漏检时沿用上一帧位置，避免遮挡闪烁', () => {
    const t = new FaceTracker()
    t.update([face(100)])
    const out = t.update([]) // 漏检
    expect(out).toHaveLength(1)
    expect(out[0].x).toBeCloseTo(100, 5)
  })

  it('连续漏检 3 帧内仍保留', () => {
    const t = new FaceTracker()
    t.update([face(100)])
    t.update([])
    t.update([])
    const out = t.update([])
    expect(out).toHaveLength(1)
  })

  it('超过容忍期后轨迹消失（不会一直糊着不存在的人脸）', () => {
    const t = new FaceTracker({ maxMissed: 3 })
    t.update([face(100)])
    t.update([]) // missed=1
    t.update([]) // missed=2
    t.update([]) // missed=3
    const out = t.update([]) // 超过
    expect(out).toHaveLength(0)
    expect(t.size).toBe(0)
  })

  it('漏检后重新检出会重置计数', () => {
    const t = new FaceTracker()
    t.update([face(100)])
    t.update([])
    t.update([face(101)])
    t.update([])
    t.update([])
    const out = t.update([])
    expect(out).toHaveLength(1)
  })
})

describe('位置平滑', () => {
  it('小幅移动时输出被平滑，不会完全跳到新位置', () => {
    const t = new FaceTracker({ smoothing: 0.5 })
    const first = t.update([face(100)])
    const second = t.update([face(120)])
    expect(first[0].x).toBeCloseTo(100, 5)
    // 平滑系数 0.5：100 → 110
    expect(second[0].x).toBeGreaterThan(100)
    expect(second[0].x).toBeLessThan(120)
  })

  it('平滑系数为 1 时完全跟随检测结果', () => {
    const t = new FaceTracker({ smoothing: 1 })
    t.update([face(100)])
    // 位移需在关联阈值内（约脸宽的 0.6 倍），否则会被当作新脸
    const out = t.update([face(130)])
    expect(out[0].x).toBeCloseTo(130, 5)
  })

  it('关键点也一起平滑', () => {
    const t = new FaceTracker({ smoothing: 0.5 })
    t.update([face(100)])
    const out = t.update([face(130)])
    expect(out[0].kps).toHaveLength(5)
    expect(out[0].kps[0][0]).toBeGreaterThan(100)
    expect(out[0].kps[0][0]).toBeLessThan(170)
  })
})

describe('多目标关联', () => {
  it('两张脸各自保持稳定 id，不互相串位', () => {
    const t = new FaceTracker({ smoothing: 1 })
    t.update([face(100), face(400)])
    const out = t.update([face(402), face(98)]) // 检测顺序打乱
    expect(out).toHaveLength(2)
    // 位置应按就近匹配，而不是按数组顺序
    const xs = out.map((f) => Math.round(f.x)).sort((a, b) => a - b)
    expect(xs[0]).toBeLessThan(150)
    expect(xs[1]).toBeGreaterThan(350)
  })

  it('新出现的人脸开启新轨迹', () => {
    const t = new FaceTracker()
    t.update([face(100)])
    const out = t.update([face(100), face(500)])
    expect(out).toHaveLength(2)
  })

  it('离得太远且不重叠的框不会被误关联', () => {
    const t = new FaceTracker({ smoothing: 1 })
    t.update([face(100)])
    // 远处出现一张新脸，旧脸消失
    const out = t.update([face(900, 900)])
    expect(out).toHaveLength(2) // 旧轨迹仍在容忍期 + 新轨迹
    // 但新轨迹应该在新位置
    expect(out.some((f) => f.x > 800)).toBe(true)
  })
})

describe('重置', () => {
  it('reset 清空所有轨迹', () => {
    const t = new FaceTracker()
    t.update([face(100)])
    t.reset()
    expect(t.size).toBe(0)
    const out = t.update([])
    expect(out).toHaveLength(0)
  })
})

describe('空输入', () => {
  it('连续空帧不会产生人脸', () => {
    const t = new FaceTracker()
    expect(t.update([])).toEqual([])
  })
})
