/**
 * MediaRecorder 降级路径。
 *
 * 何时使用：浏览器不支持 WebCodecs（`VideoEncoder`）时。
 *
 * 代价（已在 UI 中标注「实时录制模式」）：
 *   - 受实时速度限制：1 分钟视频至少要 1 分钟；
 *   - 码率不可控；
 *   - 主线程卡顿会丢帧。
 *
 * 因此它只是兜底，不是首选路径。
 */
import { VideoCancelled } from './common'

export interface RecorderOptions {
  canvas: HTMLCanvasElement
  fps: number
  /** 目标 MIME，不传则自动选 */
  mimeType?: string
  /** 码率，不传则用浏览器默认 */
  videoBitsPerSecond?: number
}

/** 选出浏览器支持的录制格式。 */
export function pickRecorderMime(): string {
  const candidates = [
    'video/mp4',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ]
  if (typeof MediaRecorder === 'undefined') return 'video/webm'
  for (const m of candidates) {
    if (MediaRecorder.isTypeSupported(m)) return m
  }
  return ''
}

/** 由 MIME 推断扩展名。 */
export function extForMime(mime: string): string {
  return mime.startsWith('video/mp4') ? 'mp4' : 'webm'
}

export class CanvasRecorder {
  private recorder: MediaRecorder | null = null
  private chunks: Blob[] = []
  private readonly mime: string

  constructor(private readonly opts: RecorderOptions) {
    this.mime = opts.mimeType ?? pickRecorderMime()
  }

  get mimeType(): string {
    return this.mime
  }

  /** 开始录制。调用方需要持续绘制 canvas。 */
  start(): void {
    if (typeof MediaRecorder === 'undefined') {
      throw new Error('当前浏览器不支持 MediaRecorder')
    }
    const stream = this.opts.canvas.captureStream(this.opts.fps)
    const recorder = new MediaRecorder(stream, {
      ...(this.mime ? { mimeType: this.mime } : {}),
      ...(this.opts.videoBitsPerSecond
        ? { videoBitsPerSecond: this.opts.videoBitsPerSecond }
        : {}),
    })

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data)
    }

    recorder.start(100)
    this.recorder = recorder
  }

  /** 停止并返回结果。 */
  stop(): Promise<Blob> {
    const recorder = this.recorder
    if (!recorder) return Promise.reject(new Error('录制尚未开始'))

    return new Promise((resolve, reject) => {
      recorder.onstop = () => {
        const blob = new Blob(this.chunks, { type: this.mime || 'video/webm' })
        this.chunks = []
        this.recorder = null
        resolve(blob)
      }
      recorder.onerror = () => reject(new Error('录制失败'))
      try {
        recorder.stop()
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)))
      }
    })
  }

  /** 取消录制并丢弃已录内容。 */
  cancel(): void {
    this.chunks = []
    if (this.recorder && this.recorder.state !== 'inactive') {
      try {
        this.recorder.stop()
      } catch {
        // 忽略
      }
    }
    this.recorder = null
  }
}

/** 辅助：等一帧的显示时间，形成实时节奏。 */
export function waitFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()))
}

/** 实时循环里的取消检查。 */
export function ensureNotCancelled(signal?: AbortSignal): void {
  if (signal?.aborted) throw new VideoCancelled()
}
