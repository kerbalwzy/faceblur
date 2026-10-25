import { describe, expect, it } from 'vitest'
import {
  buildMasks,
  DEFAULT_EXPORT_QUALITY,
  exportFileName,
  toFaceEntries,
  type FaceEntry,
  type RenderSettings,
} from '@/pipeline/image-pipeline'
import type { FaceBox } from '@/engine/detector'

const settings: RenderSettings = {
  style: 'blur',
  strength: 0.6,
  shape: 'rounded',
}

function face(x: number, y: number): FaceBox {
  return {
    x,
    y,
    width: 50,
    height: 60,
    score: 0.9,
    kps: [
      [x + 17, y + 20],
      [x + 33, y + 20],
      [x + 25, y + 33],
      [x + 19, y + 45],
      [x + 31, y + 45],
    ],
  }
}

describe('人脸条目', () => {
  it('分配稳定且唯一 id，默认全部启用', () => {
    const entries = toFaceEntries([face(0, 0), face(100, 0), face(200, 0)])
    expect(entries.map((e) => e.id)).toEqual([0, 1, 2])
    expect(entries.every((e) => e.enabled)).toBe(true)
  })

  it('两张完全重叠的脸仍然是两个条目（各自可独立开关）', () => {
    const entries = toFaceEntries([face(0, 0), face(0, 0)])
    expect(entries).toHaveLength(2)
    expect(new Set(entries.map((e) => e.id)).size).toBe(2)
  })
})

describe('逐脸开关', () => {
  const entries: FaceEntry[] = toFaceEntries([face(0, 0), face(200, 0), face(400, 0)])

  it('默认生成 3 个遮罩', () => {
    expect(buildMasks(entries, 'rounded')).toHaveLength(3)
  })

  it('关闭某一张后只生成 2 个遮罩', () => {
    const off = entries.map((e) => (e.id === 1 ? { ...e, enabled: false } : e))
    expect(buildMasks(off, 'rounded')).toHaveLength(2)
  })

  it('全部关闭时不产生遮罩（渲染层将跳过遮挡）', () => {
    const off = entries.map((e) => ({ ...e, enabled: false }))
    expect(buildMasks(off, 'rounded')).toHaveLength(0)
  })
})

describe('导出文件名', () => {
  it('保留原名并追加 -blurred，扩展名按导出格式', () => {
    expect(exportFileName('photo.jpg', 'image/png')).toBe('photo-blurred.png')
    expect(exportFileName('holiday.png', 'image/jpeg')).toBe('holiday-blurred.jpg')
    expect(exportFileName('a.webp', 'image/webp')).toBe('a-blurred.webp')
  })

  it('不覆盖原文件', () => {
    expect(exportFileName('photo.jpg', 'image/jpeg')).not.toBe('photo.jpg')
  })

  it('处理多个点与无扩展名的情况', () => {
    expect(exportFileName('my.photo.v2.jpg', 'image/png')).toBe('my.photo.v2-blurred.png')
    expect(exportFileName('noext', 'image/png')).toBe('noext-blurred.png')
  })
})

describe('导出质量', () => {
  it('默认质量为 0.92（高保真）', () => {
    expect(DEFAULT_EXPORT_QUALITY).toBe(0.92)
  })
})

describe('渲染参数与导出共用', () => {
  it('相同 settings 下，遮罩数量与形状由参数决定，与分辨率无关', () => {
    const entries = toFaceEntries([face(0, 0), face(100, 0)])
    const a = buildMasks(entries, 'rounded')
    const b = buildMasks(entries, 'ellipse')
    expect(a).toHaveLength(b.length)
    expect(a[0].shape).toBe('rounded')
    expect(b[0].shape).toBe('ellipse')
  })

  it('强度不影响遮罩几何（只影响模糊像素）', () => {
    const entries = toFaceEntries([face(10, 10)])
    const low = buildMasks(entries, settings.shape)
    const highSettings = { ...settings, strength: 1 }
    const high = buildMasks(entries, highSettings.shape)
    expect(low[0]).toEqual(high[0])
  })
})
