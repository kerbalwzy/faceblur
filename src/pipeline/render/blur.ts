/**
 * 遮挡渲染：高斯模糊、马赛克、实心色块。
 *
 * 关键约束（design D9）：所有尺寸参数都按**素材短边比例**计算，
 * 保证预览、导出图片、视频帧三者的视觉效果一致——否则调高导出分辨率会「糊得不够」。
 */
import { addMaskPath, maskBounds, type MaskGeometry } from './mask-shape'

export type BlurStyle = 'blur' | 'pixelate' | 'solid'

export interface RenderOptions {
  style: BlurStyle
  /** 0–1 的强度 */
  strength: number
  /** 色块颜色，默认黑 */
  color?: string
  /** 色块不透明度 0–1 */
  opacity?: number
}

/** 强度 → 模糊半径（像素），按素材短边比例换算。 */
export function blurRadiusFor(shortSide: number, strength: number): number {
  const s = clamp01(strength)
  // 2% 短边为基础半径，限制在 8–80，避免极小图糊成一片、超大图糊不动
  return clamp(shortSide * 0.02 * (0.5 + s * 1.5), 8, 80)
}

/** 强度 → 马赛克块大小（像素）。 */
export function pixelBlockFor(shortSide: number, strength: number): number {
  const s = clamp01(strength)
  // 从 3% 到 12% 短边
  return Math.max(4, Math.round(shortSide * (0.03 + s * 0.09)))
}

function clamp01(v: number): number {
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}

type Ctx2D = CanvasRenderingContext2D

/**
 * 在给定 canvas 上应用遮挡。
 *
 * @param ctx      目标上下文（尺寸应与素材一致）
 * @param source   原始图像（同一画布的底图已绘制好时传 null）
 * @param masks    所有需要遮挡的几何
 * @param options  样式与强度
 * @param shortSide 素材短边，用于计算模糊半径/块大小
 */
export function applyMasks(
  ctx: Ctx2D,
  source: CanvasImageSource | null,
  masks: MaskGeometry[],
  options: RenderOptions,
  shortSide: number,
): void {
  for (const mask of masks) {
    const bounds = maskBounds(mask)
    ctx.save()
    ctx.beginPath()
    addMaskPath(ctx, mask)
    ctx.clip()

    switch (options.style) {
      case 'blur':
        drawBlurred(ctx, source, bounds, blurRadiusFor(shortSide, options.strength))
        break
      case 'pixelate':
        drawPixelated(ctx, source, bounds, pixelBlockFor(shortSide, options.strength))
        break
      case 'solid': {
        ctx.globalAlpha = clamp01(options.opacity ?? 1)
        ctx.fillStyle = options.color ?? '#000000'
        const b = bounds
        ctx.fillRect(b.x, b.y, b.width, b.height)
        ctx.globalAlpha = 1
        break
      }
    }

    ctx.restore()
  }
}

/**
 * 高斯模糊：多轮「缩小采样 → 放大」，形成近似高斯的效果。
 *
 * 为什么不用 `ctx.filter = 'blur(Npx)'`：
 *   - Safari 对超大 canvas 的支持不稳定；
 *   - 无法控制「多轮累积」的强度。
 *
 * 为什么要多轮：单轮降采样在大半径下仍会保留面部轮廓，
 * 对隐私工具来说不可接受——必须让五官彻底不可辨认。
 * 迭代次数随强度增加（2–4 轮），配合更激进的降采样比。
 */
function drawBlurred(
  ctx: Ctx2D,
  source: CanvasImageSource | null,
  bounds: { x: number; y: number; width: number; height: number },
  radius: number,
): void {
  if (!source) return
  const w = Math.max(1, Math.round(bounds.width))
  const h = Math.max(1, Math.round(bounds.height))

  // 半径越大，缩得越狠
  const ratio = Math.max(4, Math.round(radius / 1.5))
  let sw = Math.max(1, Math.round(w / ratio))
  let sh = Math.max(1, Math.round(h / ratio))

  // 第 1 轮：从原图缩到极小的缩略图
  let current = createCanvas(sw, sh)
  let cctx = current.getContext('2d') as Ctx2D | null
  if (!cctx) return
  cctx.imageSmoothingEnabled = true
  cctx.imageSmoothingQuality = 'high'
  cctx.drawImage(source, bounds.x, bounds.y, w, h, 0, 0, sw, sh)

  // 后续轮次继续缩小一半：每轮都会丢失更多细节，
  // 这才是真正让五官不可辨认的关键（同尺寸重复重采样几乎没有额外效果）。
  const passes = radius > 40 ? 3 : radius > 20 ? 2 : 1
  for (let i = 0; i < passes; i++) {
    const nw = Math.max(1, Math.floor(sw / 2))
    const nh = Math.max(1, Math.floor(sh / 2))
    const next = createCanvas(nw, nh)
    const nctx = next.getContext('2d') as Ctx2D | null
    if (!nctx) break
    nctx.imageSmoothingEnabled = true
    nctx.imageSmoothingQuality = 'high'
    nctx.drawImage(current as CanvasImageSource, 0, 0, sw, sh, 0, 0, nw, nh)
    current = next
    sw = nw
    sh = nh
  }

  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(current as CanvasImageSource, 0, 0, sw, sh, bounds.x, bounds.y, w, h)
}

/** 马赛克：降采样再放大，关闭平滑以得到硬边块。 */
function drawPixelated(
  ctx: Ctx2D,
  source: CanvasImageSource | null,
  bounds: { x: number; y: number; width: number; height: number },
  block: number,
): void {
  if (!source) return
  const w = Math.max(1, Math.round(bounds.width))
  const h = Math.max(1, Math.round(bounds.height))
  const sw = Math.max(1, Math.round(w / block))
  const sh = Math.max(1, Math.round(h / block))

  const tmp = createCanvas(sw, sh)
  const tctx = tmp.getContext('2d') as Ctx2D | null
  if (!tctx) return
  // 缩小阶段也要关掉平滑，否则颜色会被平均，得不到块状效果
  tctx.imageSmoothingEnabled = false
  tctx.drawImage(source, bounds.x, bounds.y, w, h, 0, 0, sw, sh)

  ctx.imageSmoothingEnabled = false
  ctx.drawImage(tmp as CanvasImageSource, 0, 0, sw, sh, bounds.x, bounds.y, w, h)
  ctx.imageSmoothingEnabled = true
}

/** 兼容主线程 canvas 与 Worker 的 OffscreenCanvas。 */
function createCanvas(w: number, h: number): HTMLCanvasElement | OffscreenCanvas {
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    return c
  }
  return new OffscreenCanvas(w, h)
}
