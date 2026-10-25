import { describe, expect, it } from 'vitest'
import { decodeScale, iou, mergeScales, nms, postprocess, type ScaleTensors } from '@/engine/postprocess/yunet'

/** 构造一个只含指定网格位置有响应的尺度张量。 */
function makeScale(opts: {
  stride: 8 | 16 | 32
  detSize?: number
  cells: Array<{
    col: number
    row: number
    cls: number
    obj: number
    /// 相对网格的归一化偏移 [cx, cy, w, h]（w/h 为对数尺度）
    bbox: [number, number, number, number]
    kps?: number[]
  }>
}): ScaleTensors {
  const detSize = opts.detSize ?? 320
  const cols = detSize / opts.stride
  const rows = cols
  const n = cols * rows
  const cls = new Float32Array(n)
  const obj = new Float32Array(n)
  const bbox = new Float32Array(n * 4)
  const kps = new Float32Array(n * 10)

  for (const c of opts.cells) {
    const i = c.row * cols + c.col
    cls[i] = c.cls
    obj[i] = c.obj
    bbox.set(c.bbox, i * 4)
    if (c.kps) kps.set(c.kps, i * 10)
  }

  return { stride: opts.stride, cls, obj, bbox, kps, cols, rows }
}

describe('YuNet 解码公式', () => {
  it('score = sqrt(cls * obj)', () => {
    const t = makeScale({
      stride: 8,
      cells: [{ col: 10, row: 10, cls: 0.81, obj: 1.0, bbox: [0.5, 0.5, Math.log(1), Math.log(1)] }],
    })
    const [f] = decodeScale(t, { minScore: 0 })
    // sqrt(0.81 * 1.0) = 0.9
    expect(f.score).toBeCloseTo(0.9, 6)
  })

  it('中心点 = (col + bbox) * stride，宽高 = exp(bbox) * stride', () => {
    const stride = 8
    const t = makeScale({
      stride,
      cells: [
        {
          col: 12,
          row: 20,
          cls: 1,
          obj: 1,
          // 中心偏移 0.5 格，宽高 = exp(2) 与 exp(1.5) 格
          bbox: [0.5, 0.5, 2, 1.5],
        },
      ],
    })
    const [f] = decodeScale(t, { minScore: 0 })
    const cx = (12 + 0.5) * stride
    const cy = (20 + 0.5) * stride
    const w = Math.exp(2) * stride
    const h = Math.exp(1.5) * stride

    expect(f.rect.width).toBeCloseTo(w, 6)
    expect(f.rect.height).toBeCloseTo(h, 6)
    expect(f.rect.x).toBeCloseTo(cx - w / 2, 6)
    expect(f.rect.y).toBeCloseTo(cy - h / 2, 6)
  })

  it('关键点按 stride 还原到输入坐标', () => {
    const stride = 16
    const t = makeScale({
      stride,
      detSize: 320,
      cells: [
        {
          col: 5,
          row: 3,
          cls: 1,
          obj: 1,
          bbox: [0.5, 0.5, Math.log(2), Math.log(2)],
          kps: [0.25, 0.3, 0.6, 0.3, 0.4, 0.5, 0.3, 0.7, 0.55, 0.7],
        },
      ],
    })
    const [f] = decodeScale(t, { minScore: 0 })
    expect(f.kps[0][0]).toBeCloseTo((5 + 0.25) * stride, 6)
    expect(f.kps[0][1]).toBeCloseTo((3 + 0.3) * stride, 6)
    expect(f.kps[4][0]).toBeCloseTo((5 + 0.55) * stride, 6)
    expect(f.kps.length).toBe(5)
  })

  it('低于阈值的响应被过滤', () => {
    const t = makeScale({
      stride: 8,
      cells: [
        { col: 1, row: 1, cls: 0.9, obj: 0.9, bbox: [0.5, 0.5, 1, 1] },
        { col: 2, row: 2, cls: 0.3, obj: 0.3, bbox: [0.5, 0.5, 1, 1] },
      ],
    })
    const faces = decodeScale(t, { minScore: 0.6 })
    expect(faces.length).toBe(1)
    // sqrt(0.81) = 0.9 通过；sqrt(0.09) = 0.3 被过滤
    expect(faces[0].score).toBeCloseTo(0.9, 6)
  })

  it('过小的框被丢弃', () => {
    const t = makeScale({
      stride: 8,
      cells: [{ col: 1, row: 1, cls: 1, obj: 1, bbox: [0.5, 0.5, -10, -10] }],
    })
    expect(decodeScale(t, { minScore: 0, minBoxSize: 4 })).toHaveLength(0)
  })

  it('NaN / 非法值不会产生结果', () => {
    const t = makeScale({
      stride: 8,
      cells: [{ col: 1, row: 1, cls: Number.NaN, obj: 1, bbox: [0.5, 0.5, 1, 1] }],
    })
    expect(decodeScale(t, { minScore: 0 })).toHaveLength(0)
  })

  it('全零网格（背景）不会产出任何结果，即使阈值为 0', () => {
    // 回归保护：真实模型输出的背景网格 cls/obj 均为 0，
    // 若只判断 score < minScore，minScore=0 时会把所有背景当成脸。
    const t = makeScale({ stride: 8, cells: [] })
    expect(decodeScale(t, { minScore: 0 })).toHaveLength(0)
    expect(decodeScale(t, { minScore: -1 })).toHaveLength(0)
  })
})

describe('NMS', () => {
  const box = (x: number, y: number, w: number, h: number, score: number) => ({
    rect: { x, y, width: w, height: h },
    score,
    kps: Array.from({ length: 5 }, () => [x + w / 2, y + h / 2] as [number, number]),
    stride: 8 as const,
  })

  it('IoU 计算正确', () => {
    const a = { x: 0, y: 0, width: 10, height: 10 }
    const b = { x: 5, y: 5, width: 10, height: 10 }
    // 交 5x5=25，并 100+100-25=175
    expect(iou(a, b)).toBeCloseTo(25 / 175, 6)
    expect(iou(a, { x: 100, y: 100, width: 10, height: 10 })).toBe(0)
  })

  it('重叠框只保留分数最高的', () => {
    const faces = [box(0, 0, 100, 100, 0.9), box(5, 5, 100, 100, 0.8)]
    const kept = nms(faces, 0.3)
    expect(kept).toHaveLength(1)
    expect(kept[0].score).toBe(0.9)
  })

  it('不重叠的框全部保留，并按分数降序', () => {
    const faces = [box(0, 0, 50, 50, 0.7), box(200, 200, 50, 50, 0.95), box(400, 400, 50, 50, 0.8)]
    const kept = nms(faces, 0.3)
    expect(kept.map((k) => k.score)).toEqual([0.95, 0.8, 0.7])
  })
})

describe('跨尺度合并', () => {
  it('同一张脸在 8/16/32 三个尺度都检出时只保留一个', () => {
    const mk = (stride: 8 | 16 | 32, score: number) => ({
      rect: { x: 100, y: 100, width: 80, height: 80 },
      score,
      kps: Array.from({ length: 5 }, () => [140, 140] as [number, number]),
      stride,
    })
    const merged = mergeScales([mk(8, 0.8), mk(16, 0.9), mk(32, 0.85)])
    expect(merged).toHaveLength(1)
    expect(merged[0].score).toBe(0.9)
  })

  it('相邻但不重叠的两张脸都被保留', () => {
    const mk = (x: number) => ({
      rect: { x, y: 100, width: 50, height: 50 },
      score: 0.9,
      kps: Array.from({ length: 5 }, () => [x + 25, 125] as [number, number]),
      stride: 8 as const,
    })
    const merged = mergeScales([mk(100), mk(300)])
    expect(merged).toHaveLength(2)
  })
})

describe('完整后处理', () => {
  it('三个尺度合起来只输出该输出的人脸数', () => {
    const cell = (col: number, row: number) => ({
      col,
      row,
      cls: 0.9,
      obj: 0.9,
      bbox: [0.5, 0.5, Math.log(3), Math.log(3)] as [number, number, number, number],
    })

    // 8 尺度：两张不同的脸；16 尺度：其中一张的重复检测；32 尺度：无
    const s8 = makeScale({ stride: 8, cells: [cell(10, 10), cell(30, 30)] })
    const s16 = makeScale({ stride: 16, cells: [cell(5, 5)] })
    const s32 = makeScale({ stride: 32, cells: [] })

    const result = postprocess([s8, s16, s32], { minScore: 0.6 })
    // 8 尺度的 (10,10) 中心 = (84,84)，16 尺度的 (5,5) 中心 = (88,88) → 视为同一张
    expect(result.length).toBe(2)
  })

  it('结果按分数降序', () => {
    const mk = (col: number, score: number) => makeScale({
      stride: 8,
      cells: [{ col, row: 10, cls: score, obj: 1, bbox: [0.5, 0.5, Math.log(2), Math.log(2)] }],
    })
    const a = mk(10, 0.7)
    const b = mk(30, 0.95)
    const result = postprocess([a, b], { minScore: 0.6 })
    expect(result[0].score).toBeGreaterThan(result[1].score)
  })
})
