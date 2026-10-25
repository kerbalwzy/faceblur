import { describe, expect, it } from 'vitest'
import { buildInputTensor, PAD_VALUE } from '@/engine/preprocess'
import { computeLetterbox } from '@/engine/io/letterbox'

/** 构造纯色 RGBA 图。 */
function solid(w: number, h: number, r: number, g: number, b: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(w * h * 4)
  for (let i = 0; i < w * h; i++) {
    out[i * 4] = r
    out[i * 4 + 1] = g
    out[i * 4 + 2] = b
    out[i * 4 + 3] = 255
  }
  return out
}

describe('输入张量构建', () => {
  it('输出长度为 3 * detSize²，且通道顺序为 RGB（非 BGR）', () => {
    const w = 64
    const h = 64
    const rgba = solid(w, h, 10, 20, 30)
    const lb = computeLetterbox(w, h, 320)
    const t = buildInputTensor(rgba, lb)

    expect(t.length).toBe(3 * 320 * 320)
    const plane = 320 * 320
    // 取中心像素，验证 R/G/B 落在正确的平面上
    const center = 160 * 320 + 160
    expect(t[center]).toBeCloseTo(10, 0)
    expect(t[plane + center]).toBeCloseTo(20, 0)
    expect(t[plane * 2 + center]).toBeCloseTo(30, 0)
  })

  it('取值保持 0–255，不做 [-1,1] 归一化', () => {
    const rgba = solid(32, 32, 255, 128, 0)
    const lb = computeLetterbox(32, 32, 320)
    const t = buildInputTensor(rgba, lb)
    const plane = 320 * 320
    const center = 160 * 320 + 160
    expect(t[center]).toBeCloseTo(255, 0)
    expect(t[plane + center]).toBeCloseTo(128, 0)
    expect(t[plane * 2 + center]).toBeCloseTo(0, 0)
    // 最大值不超过 255
    expect(Math.max(...t.subarray(0, 1000))).toBeLessThanOrEqual(255)
  })

  it('横图上下补边为 PAD_VALUE，内容区不是', () => {
    const rgba = solid(200, 100, 255, 0, 0)
    const lb = computeLetterbox(200, 100, 320)
    const t = buildInputTensor(rgba, lb)

    // 最上面一行属于补边
    expect(t[0]).toBe(PAD_VALUE)
    // 内容区（垂直居中）
    const contentY = Math.floor(lb.offsetY + lb.contentHeight / 2)
    const idx = contentY * 320 + 160
    expect(t[idx]).toBeCloseTo(255, 0)
  })

  it('竖图左右补边为 PAD_VALUE', () => {
    const rgba = solid(100, 200, 0, 255, 0)
    const lb = computeLetterbox(100, 200, 320)
    const t = buildInputTensor(rgba, lb)
    const plane = 320 * 320
    expect(t[160 * 320 + 0]).toBe(PAD_VALUE)
    const contentX = Math.floor(lb.offsetX + lb.contentWidth / 2)
    // 该图是纯绿，绿色在第二个平面上
    expect(t[plane + 160 * 320 + contentX]).toBeCloseTo(255, 0)
    // 补边区在绿色平面上也应是 PAD_VALUE
    expect(t[plane + 160 * 320 + 0]).toBe(PAD_VALUE)
  })

  it('不同 detSize 产出对应尺寸', () => {
    const rgba = solid(100, 100, 1, 2, 3)
    for (const size of [320, 480, 640] as const) {
      const t = buildInputTensor(rgba, computeLetterbox(100, 100, size))
      expect(t.length).toBe(3 * size * size)
    }
  })

  it('1×1 图不会越界或抛错', () => {
    const rgba = solid(1, 1, 9, 9, 9)
    const t = buildInputTensor(rgba, computeLetterbox(1, 1, 320))
    expect(t.length).toBe(3 * 320 * 320)
  })
})
