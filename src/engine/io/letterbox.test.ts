import { describe, expect, it } from 'vitest'
import {
  computeLetterbox,
  computeUpscale,
  rectToSource,
  toDetectorX,
  toDetectorY,
  toSourceX,
  toSourceY,
} from '@/engine/io/letterbox'

describe('letterbox：等比缩放 + 居中补边', () => {
  it('横图（1920×1080）在 320 输入下缩放并上下补边', () => {
    const t = computeLetterbox(1920, 1080, 320)
    expect(t.scale).toBeCloseTo(320 / 1920, 10)
    expect(t.contentWidth).toBe(320)
    expect(t.contentHeight).toBe(180)
    expect(t.offsetX).toBe(0)
    expect(t.offsetY).toBe(70)
  })

  it('竖图（1080×1920）左右补边', () => {
    const t = computeLetterbox(1080, 1920, 320)
    expect(t.contentWidth).toBe(180)
    expect(t.contentHeight).toBe(320)
    expect(t.offsetX).toBe(70)
    expect(t.offsetY).toBe(0)
  })

  it('正方形不产生补边', () => {
    const t = computeLetterbox(512, 512, 320)
    expect(t.offsetX).toBe(0)
    expect(t.offsetY).toBe(0)
    expect(t.contentWidth).toBe(320)
  })

  it('宽图在 640 输入下同样保持比例', () => {
    const t = computeLetterbox(4000, 2000, 640)
    expect(t.contentWidth).toBe(640)
    expect(t.contentHeight).toBe(320)
    expect(t.offsetY).toBe(160)
  })
})

describe('坐标反变换（误差 ≤ 1px）', () => {
  const cases = [
    { w: 1920, h: 1080, label: '横图' },
    { w: 1080, h: 1920, label: '竖图' },
    { w: 800, h: 800, label: '正方形' },
    { w: 4032, h: 3024, label: '手机照片' },
  ]

  for (const { w, h, label } of cases) {
    it(`${label} ${w}x${h}：原始 → 检测 → 原始 往返一致`, () => {
      const t = computeLetterbox(w, h, 320)
      // 在素材上取几个代表性点
      const points: Array<[number, number]> = [
        [0, 0],
        [w, h],
        [w / 2, h / 2],
        [w * 0.25, h * 0.75],
        [w * 0.9, h * 0.1],
      ]
      for (const [px, py] of points) {
        const bx = toDetectorX(t, px)
        const by = toDetectorY(t, py)
        expect(toSourceX(t, bx)).toBeCloseTo(px, 6)
        expect(toSourceY(t, by)).toBeCloseTo(py, 6)
      }
    })
  }

  it('补边区域内的检测坐标会被映射到素材外，需要由 rectToSource 裁剪', () => {
    const t = computeLetterbox(1920, 1080, 320)
    // 上方补边区（y < offsetY）对应素材的负坐标
    expect(toSourceY(t, 0)).toBeLessThan(0)
    const r = rectToSource(t, { x: 0, y: 0, width: 320, height: 320 })
    // 裁剪后必须落在素材范围内
    expect(r.y).toBe(0)
    expect(r.height).toBeCloseTo(1080, 5)
    expect(r.width).toBeCloseTo(1920, 5)
  })
})

describe('rectToSource 裁剪', () => {
  it('超出素材边界的框被裁剪到合法范围', () => {
    const t = computeLetterbox(1000, 1000, 320)
    const r = rectToSource(t, { x: -50, y: -50, width: 500, height: 500 })
    expect(r.x).toBe(0)
    expect(r.y).toBe(0)
    expect(r.width).toBeLessThanOrEqual(1000)
    expect(r.height).toBeLessThanOrEqual(1000)
  })

  it('完全不重叠的框返回零尺寸而不是负值', () => {
    const t = computeLetterbox(1000, 500, 320)
    const r = rectToSource(t, { x: 0, y: 0, width: 10, height: 10 })
    expect(r.width).toBeGreaterThanOrEqual(0)
    expect(r.height).toBeGreaterThanOrEqual(0)
  })
})

describe('小图上采样', () => {
  it('短边 < 160 的图需要放大', () => {
    expect(computeUpscale(80, 400)).toBeCloseTo(2, 10)
  })

  it('短边 ≥ 160 的图不放大', () => {
    expect(computeUpscale(200, 400)).toBe(1)
    expect(computeUpscale(160, 160)).toBe(1)
  })
})

describe('非法输入', () => {
  it('尺寸为 0 时抛错而不是静默返回 NaN', () => {
    expect(() => computeLetterbox(0, 100, 320)).toThrow(RangeError)
  })

  it('检测尺寸非法时抛错', () => {
    expect(() => computeLetterbox(100, 100, 0)).toThrow(RangeError)
  })
})
