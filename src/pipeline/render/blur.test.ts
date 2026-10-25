import { describe, expect, it } from 'vitest'
import { blurRadiusFor, pixelBlockFor } from '@/pipeline/render/blur'

describe('模糊半径按素材尺寸缩放', () => {
  it('同样强度下，大图半径更大（保证导出与预览一致）', () => {
    const small = blurRadiusFor(800, 0.5)
    const large = blurRadiusFor(4000, 0.5)
    expect(large).toBeGreaterThan(small)
  })

  it('强度越高半径越大', () => {
    expect(blurRadiusFor(2000, 0.9)).toBeGreaterThan(blurRadiusFor(2000, 0.1))
  })

  it('半径被限制在合理区间，避免极小图糊成一片或超大图糊不动', () => {
    expect(blurRadiusFor(10, 1)).toBeGreaterThanOrEqual(8)
    expect(blurRadiusFor(100_000, 1)).toBeLessThanOrEqual(80)
  })

  it('非法强度不会产生 NaN', () => {
    expect(Number.isFinite(blurRadiusFor(1000, Number.NaN))).toBe(true)
    expect(Number.isFinite(blurRadiusFor(1000, -5))).toBe(true)
  })
})

describe('马赛克块大小', () => {
  it('随素材尺寸成比例增长', () => {
    expect(pixelBlockFor(4000, 0.5)).toBeGreaterThan(pixelBlockFor(800, 0.5))
  })

  it('强度越高块越大（越难辨认）', () => {
    expect(pixelBlockFor(2000, 1)).toBeGreaterThan(pixelBlockFor(2000, 0))
  })

  it('块大小至少 4px，避免没有视觉效果', () => {
    expect(pixelBlockFor(10, 0)).toBeGreaterThanOrEqual(4)
  })

  it('非法强度不会产生 NaN', () => {
    expect(Number.isFinite(pixelBlockFor(1000, Number.NaN))).toBe(true)
  })
})

describe('跨分辨率一致性（核心约束）', () => {
  it('预览与导出使用相同比例参数 → 相对半径一致', () => {
    // 同一张图在 50% 预览和 100% 导出下，半径与短边的比例应相同
    const previewShort = 1000
    const exportShort = 2000
    const rPreview = blurRadiusFor(previewShort, 0.6) / previewShort
    const rExport = blurRadiusFor(exportShort, 0.6) / exportShort
    // 未触及上下限时应完全一致
    expect(Math.abs(rPreview - rExport)).toBeLessThan(1e-9)
  })
})
