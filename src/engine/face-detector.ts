/**
 * 主线程侧检测器客户端：把推理转发给 Worker。
 *
 * 设计要点（design D4）：
 *   - 所有推理在 Worker 内完成，主线程只收发消息，保证 UI 不卡顿；
 *   - ImageBitmap 以 transferable 传递，零拷贝；
 *   - 两阶段小脸重检也在 Worker 内完成（它本地有像素，无需回传）；
 *   - 请求串行化：Worker 内部一次只跑一个推理，客户端维护队列与 id 映射。
 */
import {
  DEFAULT_DET_SIZE,
  DEFAULT_MIN_SCORE,
  type DetectionOptions,
  type DetectionProgress,
  type DetectorRuntimeInfo,
  type FaceBox,
  type FaceDetectorClient,
} from './detector'
import type { WorkerRequest, WorkerResponse } from './worker/protocol'

export interface FaceDetectorOptions {
  /** 模型地址 */
  modelUrl?: string
  /** 缓存键；换模型时递增以让旧缓存失效 */
  cacheKey?: string
  /** 自定义 Worker 工厂（测试用） */
  createWorker?: () => Worker
}

interface Pending {
  resolve: (faces: FaceBox[]) => void
  reject: (err: Error) => void
}

const DEFAULT_MODEL_URL = '/models/yunet.onnx'
const DEFAULT_CACHE_KEY = 'yunet-2026may:v1'

export class FaceDetector implements FaceDetectorClient {
  private worker: Worker | null = null
  private pending = new Map<number, Pending>()
  private nextId = 1
  private initPromise: Promise<void> | null = null
  private progressHandler: ((p: DetectionProgress) => void) | null = null
  private readyResolve: (() => void) | null = null
  private readyReject: ((e: Error) => void) | null = null
  private _runtime: DetectorRuntimeInfo | null = null
  private disposed = false

  private readonly modelUrl: string
  private readonly cacheKey: string
  private readonly createWorker: () => Worker

  constructor(opts: FaceDetectorOptions = {}) {
    this.modelUrl = opts.modelUrl ?? DEFAULT_MODEL_URL
    this.cacheKey = opts.cacheKey ?? DEFAULT_CACHE_KEY
    this.createWorker =
      opts.createWorker ??
      (() =>
        new Worker(new URL('./worker/detect.worker.ts', import.meta.url), {
          type: 'module',
          name: 'faceblur-detect',
        }))
  }

  get runtime(): DetectorRuntimeInfo | null {
    return this._runtime
  }

  init(onProgress?: (p: DetectionProgress) => void): Promise<void> {
    if (this.initPromise) return this.initPromise
    this.progressHandler = onProgress ?? null

    this.initPromise = new Promise<void>((resolve, reject) => {
      this.readyResolve = resolve
      this.readyReject = reject
      try {
        this.worker = this.createWorker()
        this.worker.onmessage = (ev: MessageEvent<WorkerResponse>) => this.handleMessage(ev.data)
        this.worker.onerror = (ev) => {
          const message = ev.message || '检测 Worker 加载失败'
          this.readyReject?.(new Error(message))
          this.rejectAll(new Error(message))
        }
        const req: WorkerRequest = { type: 'init', modelUrl: this.modelUrl, cacheKey: this.cacheKey }
        this.worker.postMessage(req)
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err))
        this.readyReject?.(e)
        this.rejectAll(e)
      }
    })

    return this.initPromise
  }

  async detect(bitmap: ImageBitmap, opts: DetectionOptions = {}): Promise<FaceBox[]> {
    if (this.disposed) throw new Error('检测器已释放')
    if (!this._runtime) throw new Error('检测器尚未初始化，请先调用 init()')
    if (!this.worker) throw new Error('Worker 不可用')

    const id = this.nextId++
    const detSize = opts.detSize ?? DEFAULT_DET_SIZE
    const minScore = opts.minScore ?? DEFAULT_MIN_SCORE
    const refine = opts.refineSmallFaces === true

    return new Promise<FaceBox[]>((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      const req: WorkerRequest = { type: 'detect', id, bitmap, detSize, minScore, refine }
      try {
        // 转移所有权，避免大图在主线程与 Worker 间复制
        this.worker!.postMessage(req, [bitmap])
      } catch (err) {
        this.pending.delete(id)
        bitmap.close?.()
        reject(err instanceof Error ? err : new Error(String(err)))
      }
    })
  }

  async dispose(): Promise<void> {
    this.disposed = true
    for (const [, p] of this.pending) p.reject(new Error('检测器已释放'))
    this.pending.clear()
    if (this.worker) {
      try {
        this.worker.postMessage({ type: 'dispose' } satisfies WorkerRequest)
      } catch {
        // 忽略：Worker 可能已终止
      }
      this.worker.terminate()
      this.worker = null
    }
    this._runtime = null
  }

  private handleMessage(msg: WorkerResponse): void {
    switch (msg.type) {
      case 'init-progress':
        this.progressHandler?.({ stage: msg.stage, ratio: msg.ratio })
        break
      case 'ready':
        this._runtime = msg.runtime
        this.readyResolve?.()
        this.readyResolve = null
        this.readyReject = null
        break
      case 'detect-result': {
        const p = this.pending.get(msg.id)
        if (p) {
          this.pending.delete(msg.id)
          p.resolve(msg.faces)
        }
        break
      }
      case 'error': {
        const err = new Error(msg.message)
        if (msg.id === null) {
          // 初始化失败
          this.readyReject?.(err)
          this.readyReject = null
          this.rejectAll(err)
        } else {
          const p = this.pending.get(msg.id)
          if (p) {
            this.pending.delete(msg.id)
            p.reject(err)
          }
        }
        break
      }
    }
  }

  private rejectAll(err: Error): void {
    for (const [, p] of this.pending) p.reject(err)
    this.pending.clear()
  }
}
