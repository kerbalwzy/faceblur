/**
 * 主线程 ↔ 检测 Worker 的消息协议。
 *
 * 所有消息都是结构化可克隆的；图像用 ImageBitmap 传递（transferable，零拷贝）。
 */
import type { DetSize, DetectionStage, FaceBox } from '../detector'

export interface InitRequest {
  type: 'init'
  /** 模型地址，默认 /models/yunet.onnx */
  modelUrl: string
  /** 缓存键，变更模型时递增以触发重新下载 */
  cacheKey: string
}

export interface DetectRequest {
  type: 'detect'
  /** 本次请求的 id，用于匹配响应 */
  id: number
  bitmap: ImageBitmap
  detSize: DetSize
  minScore: number
  /** 是否对首轮的小脸做二次裁剪重检（仅图片路径开启） */
  refine: boolean
}

export interface DisposeRequest {
  type: 'dispose'
}

export type WorkerRequest = InitRequest | DetectRequest | DisposeRequest

export interface InitProgressMessage {
  type: 'init-progress'
  stage: DetectionStage
  ratio: number
}

export interface ReadyMessage {
  type: 'ready'
  runtime: {
    simd: boolean
    numThreads: number
    crossOriginIsolated: boolean
  }
}

export interface DetectResultMessage {
  type: 'detect-result'
  id: number
  faces: FaceBox[]
  /** 本次推理耗时（ms），用于调试与基准测试 */
  elapsedMs: number
}

export interface ErrorMessage {
  type: 'error'
  /** 关联的请求 id（初始化错误时为 null） */
  id: number | null
  message: string
  stage?: DetectionStage | 'detect'
}

export type WorkerResponse = InitProgressMessage | ReadyMessage | DetectResultMessage | ErrorMessage
