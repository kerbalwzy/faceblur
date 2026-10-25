/**
 * 检测策略：把「档位」翻译成一到两次推理调用。
 *
 * 设计依据（design D15）：
 *   - 图片：默认 320 + 两阶段裁剪重检；「高精度」可切到 480 / 640；
 *   - **视频：固定 320**，不允许提档——逐帧处理下 4 倍计算量会毁掉体验。
 *
 * 两阶段（crop-and-retry）思路：
 *   首轮在整帧上检测；对于「尺寸偏小」的结果，把该区域外扩后单独放大再检测一次。
 *   这样小脸能被有效召回，而代价只集中在少数可疑区域，平均开销约 +20~40%。
 */
import type { DetSize, FaceBox } from './detector'
import { iou } from './postprocess/yunet'

/** 低于该像素宽度的人脸视为「小脸」，值得二次检测（相对素材宽度）。 */
export const SMALL_FACE_RATIO = 0.06
/** 二次检测时区域外扩比例，保证整张脸在裁剪框内。 */
export const CROP_PADDING = 0.35
/** 二次检测使用的最小输入边长（太小没有增益）。 */
export const RETRY_DET_SIZE: DetSize = 320

export interface StrategyOptions {
  /** 素材类型：视频路径禁用提档与两阶段放大（见 design D15） */
  kind: 'image' | 'video'
  /** 用户选择的精度档（仅图片生效） */
  quality?: 'standard' | 'high'
  /** 是否启用两阶段小脸重检，默认 true */
  refineSmallFaces?: boolean
}

/**
 * 首轮应使用的检测尺寸。
 * 视频恒为 320；图片在 high 档使用 640，否则 320。
 */
export function firstPassDetSize(opts: StrategyOptions): DetSize {
  if (opts.kind === 'video') return 320
  return opts.quality === 'high' ? 640 : 320
}

/**
 * 该档位应使用的置信度阈值。
 *
 * 为什么高精度档要**同时**降低阈值：
 *   实测发现提高输入分辨率后，画面边缘的小脸置信度反而下降
 *   （512 宽的拼图里，左侧人脸 320 输入得 0.73，640 输入只得 0.56）。
 *   若保持 0.6，高精度档会比标准档检出更少 —— 与用户预期完全相反。
 *
 * 因此高精度档 = 更高分辨率 + 更宽松阈值，保证「只多不少」。
 */
export function minScoreFor(opts: StrategyOptions): number {
  return opts.kind === 'image' && opts.quality === 'high' ? 0.35 : 0.6
}

/** 是否需要做二次检测。视频只做首轮（避免逐帧翻倍的开销）。 */
export function shouldRefine(opts: StrategyOptions): boolean {
  if (opts.kind === 'video') return false
  return opts.refineSmallFaces !== false
}

/** 从首轮结果中挑出值得重检的小脸区域（素材坐标）。 */
export function selectSmallFaces(
  faces: FaceBox[],
  sourceWidth: number,
  minScore = 0.6,
): FaceBox[] {
  const threshold = sourceWidth * SMALL_FACE_RATIO
  return faces.filter((f) => f.width < threshold && f.score >= minScore)
}

/**
 * 把一个人脸框外扩成「裁剪区域」，并夹紧到素材范围。
 * 返回值为素材坐标系的整数像素区域。
 */
export function expandToCrop(
  face: FaceBox,
  sourceWidth: number,
  sourceHeight: number,
): { x: number; y: number; width: number; height: number } | null {
  const padX = face.width * CROP_PADDING
  const padY = face.height * CROP_PADDING
  const x = Math.max(0, Math.floor(face.x - padX))
  const y = Math.max(0, Math.floor(face.y - padY))
  const right = Math.min(sourceWidth, Math.ceil(face.x + face.width + padX))
  const bottom = Math.min(sourceHeight, Math.ceil(face.y + face.height + padY))
  const width = right - x
  const height = bottom - y
  if (width < 8 || height < 8) return null
  return { x, y, width, height }
}

/**
 * 合并首轮与二次检测结果。
 *
 * 规则：二次结果已放大到素材坐标；若与已有框 IoU > 0.3，保留分数更高的那个；
 * 否则作为新脸加入。最后按分数降序。
 */
export function mergeRefined(base: FaceBox[], refined: FaceBox[], mergeIou = 0.3): FaceBox[] {
  const out = [...base]
  for (const r of refined) {
    const hit = out.findIndex((b) => iou(b, r) > mergeIou)
    if (hit === -1) {
      out.push(r)
    } else if (r.score > out[hit].score) {
      out[hit] = r
    }
  }
  return out.sort((a, b) => b.score - a.score)
}
