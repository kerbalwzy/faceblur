/**
 * 人脸检测器的公共契约。
 *
 * 上层（图片/视频管线）只依赖本文件的类型，不直接依赖 ORT 或模型细节，
 * 因此可以整体替换检测后端（design D4 / D7）。
 */

/** 检测精度档位：输入边长（像素）。 */
export type DetSize = 320 | 480 | 640

/** 单个关键点顺序，与 YuNet 官方一致。 */
export const KEYPOINT_NAMES = ['右眼', '左眼', '鼻尖', '右嘴角', '左嘴角'] as const

export type Keypoint = [number, number]

/**
 * 一张人脸的检测结果。
 * 坐标均为**素材原始像素坐标系**，已从检测器输入坐标反变换。
 */
export interface FaceBox {
  /** 左边界（含） */
  x: number
  /** 上边界（含） */
  y: number
  width: number
  height: number
  /** 置信度 0–1 */
  score: number
  /** 5 个关键点：[右眼, 左眼, 鼻尖, 右嘴角, 左嘴角] */
  kps: Keypoint[]
}

export interface DetectionOptions {
  /** 最低置信度，默认 0.6（design D15） */
  minScore?: number
  /** 检测输入边长，默认 320 */
  detSize?: DetSize
  /**
   * 是否对首轮检出的小脸做二次裁剪放大重检（design D15 两阶段）。
   * 仅图片路径应开启；视频逐帧处理默认关闭以保证速度。
   */
  refineSmallFaces?: boolean
}

/** 默认检测阈值：宁漏勿误（design D15）。 */
export const DEFAULT_MIN_SCORE = 0.6
/** 默认检测输入边长。 */
export const DEFAULT_DET_SIZE: DetSize = 320

/**
 * 主线程侧检测器客户端。
 * 实现负责把推理放到 Worker，避免阻塞 UI（design D4）。
 */
export interface FaceDetectorClient {
  /**
   * 加载推理运行时与模型。
   * @param onProgress 按阶段上报进度，ratio ∈ [0,1]
   */
  init(onProgress?: (p: DetectionProgress) => void): Promise<void>

  /** 检测单帧。bitmap 的所有权会转移给 Worker（zero-copy）。 */
  detect(bitmap: ImageBitmap, opts?: DetectionOptions): Promise<FaceBox[]>

  /** 释放 Worker、模型会话与缓存。 */
  dispose(): Promise<void>

  /** 当前运行时能力（init 完成后可用）。 */
  readonly runtime: DetectorRuntimeInfo | null
}

export type DetectionStage = 'runtime' | 'model' | 'session'

export interface DetectionProgress {
  stage: DetectionStage
  /** 0–1 */
  ratio: number
}

export interface DetectorRuntimeInfo {
  /** 是否支持 WASM SIMD（不支持则无法推理） */
  simd: boolean
  /** 实际使用的线程数，1 表示单线程 */
  numThreads: number
  /** 是否处于跨源隔离模式（多线程前提） */
  crossOriginIsolated: boolean
}
