/**
 * 图片导入：格式校验、EXIF 方向校正、超大图保护。
 *
 * 需求（specs/image-blur）：
 *   - 支持 JPEG / PNG / WebP；
 *   - 不支持的类型必须拒绝，且不破坏当前正在编辑的素材；
 *   - 依据 EXIF Orientation 正确摆正（预览与导出方向必须一致）；
 *   - 超过 4000 万像素时需要用户确认。
 */

/** 允许的 MIME 类型。 */
export const SUPPORTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
export type SupportedImageType = (typeof SUPPORTED_IMAGE_TYPES)[number]

/** 超过此像素数提示用户（4000 万）。 */
export const LARGE_IMAGE_PIXELS = 40_000_000

export type ImportErrorKind =
  | 'unsupported-type'
  | 'decode-failed'
  | 'too-large'
  | 'empty'

export class ImageImportError extends Error {
  readonly kind: ImportErrorKind
  constructor(kind: ImportErrorKind, message: string) {
    super(message)
    this.name = 'ImageImportError'
    this.kind = kind
  }
}

/** 判断文件类型是否受支持（以 MIME 为准，回退到扩展名）。 */
export function isSupportedImage(file: File): boolean {
  if ((SUPPORTED_IMAGE_TYPES as readonly string[]).includes(file.type)) return true
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  // 有些系统拖拽过来的文件 type 为空，用扩展名兜底
  if (!file.type) return ['jpg', 'jpeg', 'png', 'webp'].includes(ext)
  return false
}

/** 读取 EXIF 中的 Orientation（1–8）。读不到时返回 1。 */
export async function readExifOrientation(file: Blob): Promise<number> {
  try {
    const buf = await file.slice(0, 128 * 1024).arrayBuffer()
    return parseOrientation(new DataView(buf))
  } catch {
    return 1
  }
}

/** 从 JPEG 的 APP1 段解析 Orientation。 */
export function parseOrientation(view: DataView): number {
  if (view.byteLength < 4) return 1
  // JPEG 必须以 FFD8 开头
  if (view.getUint16(0) !== 0xffd8) return 1

  let offset = 2
  while (offset + 4 <= view.byteLength) {
    const marker = view.getUint16(offset)
    // 只关心 APP1（EXIF）
    if ((marker & 0xff00) !== 0xff00) break
    const size = view.getUint16(offset + 2)
    if (size < 2) break

    if (marker === 0xffe1 && offset + 10 <= view.byteLength) {
      // "Exif\0\0"
      const exifHeader = view.getUint32(offset + 4)
      if (exifHeader === 0x45786966) {
        const tiff = offset + 10
        if (tiff + 8 > view.byteLength) return 1
        const little = view.getUint16(tiff) === 0x4949
        const get16 = (o: number) => (little ? view.getUint16(o, true) : view.getUint16(o, false))
        const get32 = (o: number) => (little ? view.getUint32(o, true) : view.getUint32(o, false))

        const ifdOffset = get32(tiff + 4)
        const dirStart = tiff + ifdOffset
        if (dirStart + 2 > view.byteLength) return 1
        const count = get16(dirStart)
        for (let i = 0; i < count; i++) {
          const entry = dirStart + 2 + i * 12
          if (entry + 12 > view.byteLength) return 1
          if (get16(entry) === 0x0112) {
            const value = get16(entry + 8)
            return value >= 1 && value <= 8 ? value : 1
          }
        }
      }
    }
    offset += 2 + size
  }
  return 1
}

/** 依据 Orientation 计算显示所需的尺寸与变换（用于 canvas 绘制）。 */
export interface OrientationTransform {
  /** 是否需要交换宽高 */
  swap: boolean
  /** 绘制到目标 canvas 时的变换参数 */
  rotate: number
  flipX: boolean
  flipY: boolean
}

export function orientationTransform(orientation: number): OrientationTransform {
  switch (orientation) {
    case 2:
      return { swap: false, rotate: 0, flipX: true, flipY: false }
    case 3:
      return { swap: false, rotate: Math.PI, flipX: false, flipY: false }
    case 4:
      return { swap: false, rotate: 0, flipX: false, flipY: true }
    case 5:
      return { swap: true, rotate: Math.PI / 2, flipX: true, flipY: false }
    case 6:
      return { swap: true, rotate: Math.PI / 2, flipX: false, flipY: false }
    case 7:
      return { swap: true, rotate: -Math.PI / 2, flipX: true, flipY: false }
    case 8:
      return { swap: true, rotate: -Math.PI / 2, flipX: false, flipY: false }
    default:
      return { swap: false, rotate: 0, flipX: false, flipY: false }
  }
}

export interface LoadedImage {
  /** 摆正后的位图（尺寸已考虑 Orientation） */
  bitmap: ImageBitmap
  /** 摆正后的宽高 */
  width: number
  height: number
  /** 像素总数（摆正后） */
  pixels: number
  /** 原始文件名 */
  name: string
  /** 原始 MIME */
  type: string
}

export interface ImportOptions {
  /** 用户已确认处理超大图 */
  allowLarge?: boolean
}

/**
 * 完整导入流程：校验 → 解码 → 方向校正 → 尺寸检查。
 *
 * @throws ImageImportError
 */
export async function importImage(file: File, opts: ImportOptions = {}): Promise<LoadedImage> {
  if (file.size === 0) {
    throw new ImageImportError('empty', '文件为空')
  }
  if (!isSupportedImage(file)) {
    throw new ImageImportError(
      'unsupported-type',
      `不支持的格式：${file.type || file.name.split('.').pop() || '未知'}。请使用 JPEG、PNG 或 WebP。`,
    )
  }

  const orientation = await readExifOrientation(file)

  let raw: ImageBitmap
  try {
    raw = await createImageBitmap(file)
  } catch {
    throw new ImageImportError('decode-failed', '图片解码失败，文件可能已损坏。')
  }

  const t = orientationTransform(orientation)
  const width = t.swap ? raw.height : raw.width
  const height = t.swap ? raw.width : raw.height
  const pixels = width * height

  if (pixels > LARGE_IMAGE_PIXELS && !opts.allowLarge) {
    raw.close()
    throw new ImageImportError(
      'too-large',
      `图片约 ${(pixels / 1_000_000).toFixed(0)} 万像素，处理可能较慢。是否继续？`,
    )
  }

  // 无方向信息时直接复用原始 bitmap
  if (orientation === 1) {
    return { bitmap: raw, width, height, pixels, name: file.name, type: file.type || 'image/jpeg' }
  }

  const canvas = new OffscreenCanvas(width, height)
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    raw.close()
    throw new ImageImportError('decode-failed', '无法创建绘图上下文')
  }

  ctx.save()
  // 以目标画布中心为原点应用变换
  ctx.translate(width / 2, height / 2)
  ctx.rotate(t.rotate)
  if (t.flipX) ctx.scale(-1, 1)
  if (t.flipY) ctx.scale(1, -1)
  // 旋转 90° 时绘制用的仍是原图宽高
  const drawW = t.swap ? height : width
  const drawH = t.swap ? width : height
  ctx.drawImage(raw, -drawW / 2, -drawH / 2, drawW, drawH)
  ctx.restore()

  const bitmap = canvas.transferToImageBitmap()
  raw.close()

  return { bitmap, width, height, pixels, name: file.name, type: file.type || 'image/jpeg' }
}

/** 从剪贴板事件中取出图片文件（粘贴导入用）。 */
export function extractImageFromClipboard(items: DataTransferItemList | null): File | null {
  if (!items) return null
  for (const item of Array.from(items)) {
    if (item.kind === 'file' && isSupportedImage(item.getAsFile() as File)) {
      return item.getAsFile()
    }
  }
  return null
}
