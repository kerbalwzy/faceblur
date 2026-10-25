import { describe, expect, it } from 'vitest'
import { addMaskPath, computeMask, hasUsableKeypoints, maskBounds } from '@/pipeline/render/mask-shape'
import type { FaceBox } from '@/engine/detector'

/** 构造一张正脸：宽 100 高 120，眼睛水平排列。 */
function frontFace(): FaceBox {
  const x = 100
  const y = 100
  const w = 100
  const h = 120
  return {
    x,
    y,
    width: w,
    height: h,
    score: 0.95,
    kps: [
      [x + w * 0.35, y + h * 0.35], // 右眼
      [x + w * 0.65, y + h * 0.35], // 左眼
      [x + w * 0.5, y + h * 0.55], // 鼻尖
      [x + w * 0.38, y + h * 0.75], // 右嘴角
      [x + w * 0.62, y + h * 0.75], // 左嘴角
    ],
  }
}

/** 侧脸：两眼明显倾斜。 */
function sideFace(): FaceBox {
  const f = frontFace()
  f.kps = [
    [f.x + f.width * 0.4, f.y + f.height * 0.25],
    [f.x + f.width * 0.62, f.y + f.height * 0.42],
    [f.x + f.width * 0.48, f.y + f.height * 0.55],
    [f.x + f.width * 0.3, f.y + f.height * 0.7],
    [f.x + f.width * 0.5, f.y + f.height * 0.78],
  ]
  return f
}

describe('关键点可用性', () => {
  it('正常关键点可用', () => {
    expect(hasUsableKeypoints(frontFace())).toBe(true)
  })

  it('缺少关键点或含 NaN 时不可用', () => {
    const f = frontFace()
    expect(hasUsableKeypoints({ ...f, kps: [] })).toBe(false)
    expect(hasUsableKeypoints({ ...f, kps: [[Number.NaN, 1]] as never })).toBe(false)
  })

  it('两眼重合视为不可用（防止角度计算产生 NaN）', () => {
    const f = frontFace()
    f.kps[1] = [...f.kps[0]] as [number, number]
    expect(hasUsableKeypoints(f)).toBe(false)
  })
})

describe('遮罩几何', () => {
  it('遮罩完全包含人脸框核心区域（上下左右各外扩 ≥5%）', () => {
    const f = frontFace()
    const m = computeMask(f)
    const b = maskBounds(m)

    expect(b.x).toBeLessThanOrEqual(f.x)
    expect(b.y).toBeLessThanOrEqual(f.y)
    expect(b.x + b.width).toBeGreaterThanOrEqual(f.x + f.width)
    expect(b.y + b.height).toBeGreaterThanOrEqual(f.y + f.height)
  })

  it('向上外扩多于向下（覆盖额头，避免露额头）', () => {
    const f = frontFace()
    const m = computeMask(f)
    const b = maskBounds(m)
    const topOverhang = f.y - b.y
    const bottomOverhang = b.y + b.height - (f.y + f.height)
    expect(topOverhang).toBeGreaterThan(bottomOverhang)
  })

  it('正脸时主轴角度接近 0', () => {
    const m = computeMask(frontFace())
    expect(Math.abs(m.angle)).toBeLessThan(0.05)
  })

  it('侧脸时主轴角度随眼睛连线倾斜', () => {
    const m = computeMask(sideFace())
    expect(Math.abs(m.angle)).toBeGreaterThan(0.2)
  })

  it('关键点不可用时退回轴对齐（角度 0），不崩溃', () => {
    const f = frontFace()
    f.kps = []
    const m = computeMask(f)
    expect(m.angle).toBe(0)
    expect(Number.isFinite(m.cx)).toBe(true)
    expect(Number.isFinite(m.ry)).toBe(true)
  })

  it('支持切换到椭圆形状', () => {
    expect(computeMask(frontFace()).shape).toBe('rounded')
    expect(computeMask(frontFace(), { shape: 'ellipse' }).shape).toBe('ellipse')
  })

  it('可调外扩参数确实生效', () => {
    const f = frontFace()
    const small = computeMask(f, { paddingX: 0, paddingY: 0, paddingTop: 0 })
    const large = computeMask(f, { paddingX: 0.5, paddingY: 0.5, paddingTop: 0.3 })
    expect(large.rx).toBeGreaterThan(small.rx)
    expect(large.ry).toBeGreaterThan(small.ry)
  })
})

describe('外接矩形', () => {
  it('旋转后包围盒尺寸不小于原半轴', () => {
    const m = computeMask(sideFace())
    const b = maskBounds(m)
    expect(b.width).toBeGreaterThan(0)
    expect(b.height).toBeGreaterThan(0)
    expect(b.width).toBeGreaterThanOrEqual(Math.min(m.rx, m.ry) * 2 - 1)
  })
})

describe('路径生成', () => {
  function fakeCtx() {
    const calls: string[] = []
    return {
      calls,
      ellipse: () => calls.push('ellipse'),
      arcTo: () => calls.push('arcTo'),
      moveTo: () => calls.push('moveTo'),
      lineTo: () => calls.push('lineTo'),
    }
  }

  it('椭圆形状调用 ellipse', () => {
    const ctx = fakeCtx()
    addMaskPath(ctx, { ...computeMask(frontFace()), shape: 'ellipse' })
    expect(ctx.calls).toContain('ellipse')
  })

  it('圆角矩形使用 arcTo 生成真正的圆角', () => {
    const ctx = fakeCtx()
    addMaskPath(ctx, computeMask(frontFace()))
    expect(ctx.calls).toContain('moveTo')
    expect(ctx.calls.filter((c) => c === 'arcTo').length).toBe(4)
  })
})
