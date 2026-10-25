/**
 * 视频处理管线：逐帧检测 + 遮挡绘制 + 重新编码导出。
 *
 * 流程：
 *   视频元素 → 跳转到第 n 帧 → 画到 OffscreenCanvas
 *            → 传给检测器 → 帧间追踪平滑 → 绘制遮挡
 *            → 交给编码器（WebCodecs 或 MediaRecorder）
 *
 * 内存约束（specs/video-blur）：逐帧释放，绝不把整段视频的帧留在内存里。
 */
import type { FaceDetectorClient, FaceBox } from '@/engine/detector'
import { FaceTracker } from './video/track'
import { computeMask, type MaskShape } from './render/mask-shape'
import { applyMasks, type BlurStyle } from './render/blur'
import { encodeVideo, selectCodec, type SelectedCodec } from './video/encode-webcodecs'
import { throwIfAborted, type ProgressInfo } from './video/common'
import { CanvasRecorder, extForMime } from './video/encode-mediarecorder'

/** 视频检测固定用 320（design D15：逐帧提档会毁掉体验）。 */
export const VIDEO_DET_SIZE = 320

export interface VideoRenderSettings {
  style: BlurStyle
  strength: number
  shape: MaskShape
  color?: string
  opacity?: number
  minScore?: number
}

export interface ProcessOptions {
  onProgress?: (p: ProgressInfo) => void
  signal?: AbortSignal
}

export { VideoCancelled, throwIfAborted, type ProgressInfo } from './video/common'

export interface VideoProcessResult {
  blob: Blob
  mime: string
  ext: string
  /** 是否走了降级的实时录制路径 */
  degraded: boolean
  frames: number
}

/** 从人脸列表生成遮罩并渲染到画布。 */
export function renderVideoFrame(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  source: CanvasImageSource,
  faces: FaceBox[],
  settings: VideoRenderSettings,
  width: number,
  height: number,
): void {
  ctx.save()
  ctx.clearRect(0, 0, width, height)
  ctx.drawImage(source, 0, 0, width, height)
  ctx.restore()

  if (faces.length === 0) return

  const masks = faces.map((f) => computeMask(f, { shape: settings.shape }))
  applyMasks(
    ctx as CanvasRenderingContext2D,
    source,
    masks,
    {
      style: settings.style,
      strength: settings.strength,
      color: settings.color,
      opacity: settings.opacity,
    },
    Math.min(width, height),
  )
}

/** 等待视频 seek 到指定时间完成。 */
function seekTo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      video.removeEventListener('seeked', onSeeked)
      video.removeEventListener('error', onError)
      clearTimeout(timer)
    }
    const onSeeked = () => {
      cleanup()
      resolve()
    }
    const onError = () => {
      cleanup()
      reject(new Error('视频解码失败'))
    }
    // 某些损坏或未就绪的文件不会触发 seeked，必须有超时兜底，
    // 否则整个处理会永久挂起（实测：视频未加载完就 seek 会卡死）。
    const timer = setTimeout(() => {
      cleanup()
      reject(new Error('视频定位超时，请重新导入该视频'))
    }, 15_000)
    video.addEventListener('seeked', onSeeked)
    video.addEventListener('error', onError)
    video.currentTime = Math.min(time, Math.max(0, (video.duration || 0) - 0.001))
  })
}

/**
 * 确保视频已经具备可绘制的数据。
 *
 * HAVE_CURRENT_DATA(2) 以上才能 drawImage 出画面；
 * 未就绪时直接 seek 会让浏览器内部状态错乱，表现为处理永久卡住。
 */
export async function ensureVideoReady(video: HTMLVideoElement): Promise<void> {
  if (video.readyState >= 2) return

  await new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      video.removeEventListener('loadeddata', onReady)
      video.removeEventListener('error', onError)
      clearTimeout(timer)
    }
    const onReady = () => {
      cleanup()
      resolve()
    }
    const onError = () => {
      cleanup()
      reject(new Error('视频无法解码，请尝试转码为 H.264 的 MP4'))
    }
    const timer = setTimeout(() => {
      cleanup()
      reject(new Error('视频加载超时'))
    }, 30_000)
    video.addEventListener('loadeddata', onReady)
    video.addEventListener('error', onError)
  })
}

/**
 * 用「seek 逐帧」的方式处理视频。
 *
 * 为什么不用 play() + requestVideoFrameCallback：
 *   play() 受实时速度限制（1 分钟视频至少要播 1 分钟），
 *   而 seek 方式可以按任意速度推进，且帧序确定、便于进度上报与取消。
 *   代价是 seek 本身较慢，但对「离线处理」场景是可接受的权衡。
 */
export async function processVideo(
  detector: FaceDetectorClient,
  video: HTMLVideoElement,
  settings: VideoRenderSettings,
  options: ProcessOptions = {},
): Promise<VideoProcessResult> {
  const { onProgress, signal } = options
  const width = video.videoWidth
  const height = video.videoHeight
  const duration = video.duration
  if (!width || !height || !Number.isFinite(duration) || duration <= 0) {
    throw new Error('视频元信息不完整，无法处理')
  }

  // 统一到 30fps 输出（浏览器不暴露真实帧率，30 是通用折中）
  const fps = 30
  const totalFrames = Math.max(1, Math.round(duration * fps))

  // 必须先等视频有可绘制数据，否则首次 seek 会让处理卡死
  await ensureVideoReady(video)

  const codec: SelectedCodec | null = await selectCodec(width, height, fps)
  if (!codec) {
    throw new Error('当前浏览器不支持视频编码（需要 WebCodecs），请使用较新版本的 Chrome 或 Safari')
  }

  const canvas = new OffscreenCanvas(width, height)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('无法创建视频处理画布')

  const tracker = new FaceTracker()

  const result = await encodeVideo(
    codec,
    totalFrames,
    async (i) => {
      throwIfAborted(signal)

      await seekTo(video, i / fps)
      ctx.drawImage(video, 0, 0, width, height)

      // 每帧检测：传副本，因为检测器会转移所有权
      const bitmap = await createImageBitmap(canvas)
      const raw = await detector.detect(bitmap, {
        detSize: VIDEO_DET_SIZE,
        minScore: settings.minScore,
        // 视频不做两阶段重检（逐帧翻倍不可接受）
        refineSmallFaces: false,
      })

      const tracked = tracker.update(raw)
      renderVideoFrame(ctx, video, tracked, settings, width, height)
      return canvas
    },
    {
      width,
      height,
      fps,
      signal,
      onFrameEncoded: (frame, total) => {
        onProgress?.({ frame, total, ratio: frame / total })
      },
    },
  )

  return {
    ...result,
    degraded: false,
    frames: totalFrames,
  }
}

/** 供 UI 判断能力。 */
export { selectCodec }

/** 当前浏览器是否支持 WebCodecs 编码（决定走主路径还是降级路径）。 */
export function canUseWebCodecs(): boolean {
  return typeof globalThis !== 'undefined' && 'VideoEncoder' in globalThis && 'VideoFrame' in globalThis
}

/**
 * 用 MediaRecorder 实时录制的方式处理视频（降级路径）。
 *
 * 与主路径的差异：必须按真实时间推进，否则录出来的视频会变速。
 * 因此这里用 requestAnimationFrame 节流，处理速度 = 播放速度。
 */
export async function processVideoRealtime(
  detector: FaceDetectorClient,
  video: HTMLVideoElement,
  settings: VideoRenderSettings,
  options: ProcessOptions = {},
): Promise<VideoProcessResult> {
  const { onProgress, signal } = options
  const width = video.videoWidth
  const height = video.videoHeight
  const duration = video.duration
  if (!width || !height || !Number.isFinite(duration) || duration <= 0) {
    throw new Error('视频元信息不完整，无法处理')
  }

  const fps = 30
  const totalFrames = Math.max(1, Math.round(duration * fps))

  // MediaRecorder 需要 HTMLCanvasElement（不支持 OffscreenCanvas.captureStream 在部分浏览器）
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('无法创建视频处理画布')

  const recorder = new CanvasRecorder({ canvas, fps })
  const tracker = new FaceTracker()

  await video.play().catch(() => {
    throw new Error('浏览器阻止了自动播放，请再次点击开始')
  })

  recorder.start()

  try {
    for (let i = 0; i < totalFrames; i++) {
      throwIfAborted(signal)
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      // 保持实时节奏：让视频按真实速度播放
      if (video.ended) break

      ctx.drawImage(video, 0, 0, width, height)
      const bitmap = await createImageBitmap(canvas)
      const raw = await detector.detect(bitmap, {
        detSize: VIDEO_DET_SIZE,
        minScore: settings.minScore,
        refineSmallFaces: false,
      })
      const tracked = tracker.update(raw)
      renderVideoFrame(ctx, video, tracked, settings, width, height)

      onProgress?.({ frame: i + 1, total: totalFrames, ratio: (i + 1) / totalFrames })
    }

    const blob = await recorder.stop()
    return {
      blob,
      mime: recorder.mimeType || 'video/webm',
      ext: extForMime(recorder.mimeType || 'video/webm'),
      degraded: true,
      frames: totalFrames,
    }
  } catch (err) {
    recorder.cancel()
    throw err
  } finally {
    video.pause()
  }
}

