import { describe, expect, it } from 'vitest'
import {
  expandToCrop,
  firstPassDetSize,
  mergeRefined,
  minScoreFor,
  selectSmallFaces,
  shouldRefine,
  SMALL_FACE_RATIO,
} from '@/engine/strategy'
import type { FaceBox } from '@/engine/detector'

const face = (x: number, y: number, w: number, h: number, score = 0.9): FaceBox => ({
  x,
  y,
  width: w,
  height: h,
  score,
  kps: Array.from({ length: 5 }, () => [x + w / 2, y + h / 2] as [number, number]),
})

describe('精度档位', () => {
  it('视频恒为 320，即使请求高精度也不提档', () => {
    expect(firstPassDetSize({ kind: 'video', quality: 'high' })).toBe(320)
    expect(firstPassDetSize({ kind: 'video', quality: 'standard' })).toBe(320)
  })

  it('图片高精度档使用 640，标准档使用 320', () => {
    expect(firstPassDetSize({ kind: 'image', quality: 'high' })).toBe(640)
    expect(firstPassDetSize({ kind: 'image', quality: 'standard' })).toBe(320)
    expect(firstPassDetSize({ kind: 'image' })).toBe(320)
  })

  it('视频不做两阶段重检（避免逐帧翻倍开销）', () => {
    expect(shouldRefine({ kind: 'video' })).toBe(false)
  })

  it('图片默认做两阶段重检，可显式关闭', () => {
    expect(shouldRefine({ kind: 'image' })).toBe(true)
    expect(shouldRefine({ kind: 'image', refineSmallFaces: false })).toBe(false)
  })
})

describe('小脸筛选', () => {
  it('按素材宽度比例筛选小脸', () => {
    const width = 1000 // 阈值 = 60px
    const faces = [face(0, 0, 30, 40), face(100, 0, 200, 200), face(400, 0, 50, 60)]
    const small = selectSmallFaces(faces, width)
    expect(small).toHaveLength(2)
    expect(small.every((f) => f.width < width * SMALL_FACE_RATIO)).toBe(true)
  })

  it('低置信度的小脸不作为重检目标', () => {
    const faces = [face(0, 0, 20, 30, 0.3)]
    expect(selectSmallFaces(faces, 1000, 0.6)).toHaveLength(0)
  })
})

describe('裁剪区域', () => {
  it('外扩后包含完整人脸', () => {
    const f = face(100, 100, 40, 50)
    const crop = expandToCrop(f, 1000, 1000)!
    expect(crop.x).toBeLessThanOrEqual(f.x)
    expect(crop.y).toBeLessThanOrEqual(f.y)
    expect(crop.x + crop.width).toBeGreaterThanOrEqual(f.x + f.width)
    expect(crop.y + crop.height).toBeGreaterThanOrEqual(f.y + f.height)
  })

  it('贴着图片边缘时被夹紧，不越界', () => {
    const f = face(0, 0, 30, 30)
    const crop = expandToCrop(f, 200, 200)!
    expect(crop.x).toBe(0)
    expect(crop.y).toBe(0)
    expect(crop.x + crop.width).toBeLessThanOrEqual(200)
    expect(crop.y + crop.height).toBeLessThanOrEqual(200)
  })

  it('右下角同样被夹紧', () => {
    const f = face(170, 170, 30, 30)
    const crop = expandToCrop(f, 200, 200)!
    expect(crop.x + crop.width).toBeLessThanOrEqual(200)
    expect(crop.y + crop.height).toBeLessThanOrEqual(200)
  })

  it('退化的框返回 null，避免无意义的重检', () => {
    expect(expandToCrop(face(0, 0, 1, 1), 100, 100)).toBeNull()
  })
})

describe('结果合并', () => {
  it('二次结果与已有框重叠时保留分数更高的', () => {
    const base = [face(100, 100, 50, 50, 0.7)]
    const refined = [face(102, 102, 50, 50, 0.95)]
    const merged = mergeRefined(base, refined)
    expect(merged).toHaveLength(1)
    expect(merged[0].score).toBe(0.95)
  })

  it('已有框分数更高时不被覆盖', () => {
    const base = [face(100, 100, 50, 50, 0.98)]
    const refined = [face(102, 102, 50, 50, 0.8)]
    const merged = mergeRefined(base, refined)
    expect(merged).toHaveLength(1)
    expect(merged[0].score).toBe(0.98)
  })

  it('不重叠的新脸被加入', () => {
    const base = [face(0, 0, 50, 50, 0.9)]
    const refined = [face(400, 400, 50, 50, 0.85)]
    const merged = mergeRefined(base, refined)
    expect(merged).toHaveLength(2)
  })

  it('结果按分数降序', () => {
    const merged = mergeRefined([face(0, 0, 50, 50, 0.7)], [face(400, 400, 50, 50, 0.95)])
    expect(merged[0].score).toBe(0.95)
  })
})

describe('阈值随档位变化（保证高精度只多不少）', () => {
  it('标准档使用默认阈值 0.6', () => {
    expect(minScoreFor({ kind: 'image', quality: 'standard' })).toBe(0.6)
    expect(minScoreFor({ kind: 'image' })).toBe(0.6)
  })

  it('高精度档放宽到 0.35', () => {
    // 回归保护：实测 640 输入会让边缘小脸置信度从 0.73 降到 0.56，
    // 若不放宽阈值，高精度档会比标准档检出更少。
    expect(minScoreFor({ kind: 'image', quality: 'high' })).toBe(0.35)
  })

  it('高精度档阈值必须低于标准档', () => {
    const standard = minScoreFor({ kind: 'image', quality: 'standard' })
    const high = minScoreFor({ kind: 'image', quality: 'high' })
    expect(high).toBeLessThan(standard)
  })

  it('视频档位不放松阈值（避免逐帧误检）', () => {
    expect(minScoreFor({ kind: 'video', quality: 'high' })).toBe(0.6)
  })
})
