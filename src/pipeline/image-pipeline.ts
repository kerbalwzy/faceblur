/**
 * 图片处理管线：检测 → 渲染遮挡 → 导出。
 *
 * 设计要点：
 *   - 参数调整只重绘，**不重新检测**（specs/image-blur「实时预览」）；
 *   - 导出使用素材原始分辨率，与预览共用同一套比例参数（design D9）；
 *   - 逐脸开关：用户可单独关闭某张脸的遮挡。
 */
import type { FaceBox } from '@/engine/detector'
import { computeMask, type MaskGeometry, type MaskShape } from './render/mask-shape'
import { applyMasks, type BlurStyle } from './render/blur'

export interface RenderSettings {
  style: BlurStyle
  /** 0–1 */
  strength: number
  /** 遮罩形状 */
  shape: MaskShape
  color?: string
  opacity?: number
}

export interface FaceEntry {
  /** 稳定的 id，用于逐脸开关 */
  id: number
  box: FaceBox
  /** 是否对该脸应用遮挡 */
  enabled: boolean
}

/** 为检测结果分配稳定 id。 */
export function toFaceEntries(faces: FaceBox[]): FaceEntry[] {
  return faces.map((box, i) => ({ id: i, box, enabled: true }))
}

/** 从人脸列表生成遮挡几何（只包含启用的人脸）。 */
export function buildMasks(entries: FaceEntry[], shape: MaskShape): MaskGeometry[] {
  return entries.filter((e) => e.enabled).map((e) => computeMask(e.box, { shape }))
}

export interface RenderTarget {
  ctx: CanvasRenderingContext2D
  width: number
  height: number
}

/**
 * 渲染一帧：先画原图，再对启用的脸应用遮挡。
 *
 * @param source 原图（ImageBitmap / HTMLImageElement / Canvas）
 */
export function renderImage(
  target: RenderTarget,
  source: CanvasImageSource,
  entries: FaceEntry[],
  settings: RenderSettings,
): void {
  const { ctx, width, height } = target
  ctx.save()
  ctx.clearRect(0, 0, width, height)
  ctx.drawImage(source, 0, 0, width, height)
  ctx.restore()

  const masks = buildMasks(entries, settings.shape)
  if (masks.length === 0) return

  const shortSide = Math.min(width, height)
  applyMasks(ctx, source, masks, {
    style: settings.style,
    strength: settings.strength,
    color: settings.color,
    opacity: settings.opacity,
  }, shortSide)
}

export type ExportFormat = 'image/jpeg' | 'image/png' | 'image/webp'

/** 导出的默认质量（仅 JPEG/WebP 生效）。 */
export const DEFAULT_EXPORT_QUALITY = 0.92

/** 生成导出文件名：原名 + -blurred（不覆盖原文件）。 */
export function exportFileName(originalName: string, format: ExportFormat): string {
  const base = originalName.replace(/\.[^./\\]+$/, '') || 'image'
  const ext = format === 'image/jpeg' ? 'jpg' : format === 'image/webp' ? 'webp' : 'png'
  return `${base}-blurred.${ext}`
}

/**
 * 以原始分辨率导出。
 *
 * @param source  原图（尺寸应为素材原始尺寸）
 * @param entries 人脸列表
 * @param settings 渲染参数
 */
export async function exportImage(
  source: CanvasImageSource,
  width: number,
  height: number,
  entries: FaceEntry[],
  settings: RenderSettings,
  format: ExportFormat,
  quality = DEFAULT_EXPORT_QUALITY,
): Promise<Blob> {
  const canvas = createCanvas(width, height)
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | null
  if (!ctx) throw new Error('无法创建导出画布')

  // 不透明背景，避免 WebP/JPEG 透明区域变黑
  if (format !== 'image/png') {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)
  }

  renderImage({ ctx, width, height }, source, entries, settings)

  const blob = await toBlob(canvas, format, quality)
  if (!blob) throw new Error('导出失败：无法编码图像')
  return blob
}

function createCanvas(w: number, h: number): HTMLCanvasElement | OffscreenCanvas {
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    return c
  }
  return new OffscreenCanvas(w, h)
}

function toBlob(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  format: ExportFormat,
  quality: number,
): Promise<Blob | null> {
  if (typeof (canvas as HTMLCanvasElement).toBlob === 'function') {
    return new Promise((resolve) =>
      (canvas as HTMLCanvasElement).toBlob(resolve, format, quality),
    )
  }
  return (canvas as OffscreenCanvas).convertToBlob({ type: format, quality })
}

/** 触发浏览器下载。 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  // 稍后释放，避免 Safari 下载中断
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
