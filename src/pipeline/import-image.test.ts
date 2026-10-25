import { describe, expect, it } from 'vitest'
import {
  ImageImportError,
  isSupportedImage,
  LARGE_IMAGE_PIXELS,
  orientationTransform,
  parseOrientation,
} from '@/pipeline/import-image'

/** 构造一个小尺寸 JPEG 头，包含指定的 EXIF Orientation。 */
function makeJpegWithOrientation(orientation: number, little = false): DataView {
  // 一个最小的 APP1/EXIF 段：只含 1 个 IFD 项（Orientation）
  const tiff: number[] = []
  const push16 = (v: number) => {
    if (little) tiff.push(v & 0xff, (v >> 8) & 0xff)
    else tiff.push((v >> 8) & 0xff, v & 0xff)
  }
  const push32 = (v: number) => {
    if (little) tiff.push(v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff)
    else tiff.push((v >>> 24) & 0xff, (v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff)
  }

  // TIFF header
  if (little) tiff.push(0x49, 0x49)
  else tiff.push(0x4d, 0x4d)
  push16(42)
  push32(8) // IFD0 偏移

  // IFD0
  push16(1) // 1 个条目
  push16(0x0112) // Orientation
  push16(3) // SHORT
  push32(1) // count
  push16(orientation)
  push16(0)
  push32(0) // next IFD

  const exifPayload = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00, ...tiff] // "Exif\0\0"
  const app1Len = exifPayload.length + 2

  const bytes = [
    0xff, 0xd8, // SOI
    0xff, 0xe1, // APP1
    (app1Len >> 8) & 0xff, app1Len & 0xff,
    ...exifPayload,
    0xff, 0xd9, // EOI
  ]
  return new DataView(new Uint8Array(bytes).buffer)
}

describe('EXIF Orientation 解析', () => {
  it('大端序读取 Orientation=6', () => {
    expect(parseOrientation(makeJpegWithOrientation(6, false))).toBe(6)
  })

  it('小端序读取 Orientation=8', () => {
    expect(parseOrientation(makeJpegWithOrientation(8, true))).toBe(8)
  })

  it('没有 EXIF 的 JPEG 返回 1（不旋转）', () => {
    const plain = new DataView(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]).buffer)
    expect(parseOrientation(plain)).toBe(1)
  })

  it('不是 JPEG（例如 PNG）时返回 1 而不是崩溃', () => {
    const png = new DataView(new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer)
    expect(parseOrientation(png)).toBe(1)
  })

  it('数据被截断时安全返回 1', () => {
    expect(parseOrientation(new DataView(new ArrayBuffer(2)))).toBe(1)
  })
})

describe('方向变换', () => {
  it('Orientation=6（顺时针 90°）需要交换宽高', () => {
    const t = orientationTransform(6)
    expect(t.swap).toBe(true)
    expect(t.rotate).toBeCloseTo(Math.PI / 2)
  })

  it('Orientation=3（180°）不交换宽高', () => {
    const t = orientationTransform(3)
    expect(t.swap).toBe(false)
    expect(t.rotate).toBeCloseTo(Math.PI)
  })

  it('Orientation=1 或未知值不做任何变换', () => {
    expect(orientationTransform(1)).toEqual({ swap: false, rotate: 0, flipX: false, flipY: false })
    expect(orientationTransform(99)).toEqual({ swap: false, rotate: 0, flipX: false, flipY: false })
  })

  it('2/4/5/7/8 都有对应的镜像或旋转定义', () => {
    for (const o of [2, 4, 5, 7, 8]) {
      const t = orientationTransform(o)
      expect(t.rotate !== 0 || t.flipX || t.flipY).toBe(true)
    }
  })
})

describe('格式校验', () => {
  const mk = (name: string, type: string) => new File([new Uint8Array([1])], name, { type })

  it('接受 JPEG / PNG / WebP', () => {
    expect(isSupportedImage(mk('a.jpg', 'image/jpeg'))).toBe(true)
    expect(isSupportedImage(mk('a.png', 'image/png'))).toBe(true)
    expect(isSupportedImage(mk('a.webp', 'image/webp'))).toBe(true)
  })

  it('拒绝 GIF / HEIC / 文本', () => {
    expect(isSupportedImage(mk('a.gif', 'image/gif'))).toBe(false)
    expect(isSupportedImage(mk('a.heic', 'image/heic'))).toBe(false)
    expect(isSupportedImage(mk('a.txt', 'text/plain'))).toBe(false)
  })

  it('MIME 为空时按扩展名兜底', () => {
    expect(isSupportedImage(mk('photo.JPEG', ''))).toBe(true)
    expect(isSupportedImage(mk('photo.bmp', ''))).toBe(false)
  })
})

describe('错误类型', () => {
  it('错误带可判别的 kind，便于 UI 分支处理', () => {
    const e = new ImageImportError('unsupported-type', 'x')
    expect(e.kind).toBe('unsupported-type')
    expect(e).toBeInstanceOf(Error)
  })

  it('大图阈值是 4000 万像素', () => {
    expect(LARGE_IMAGE_PIXELS).toBe(40_000_000)
  })
})
