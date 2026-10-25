/**
 * WebCodecs 视频编码：把逐帧画布编码成 MP4 / WebM。
 *
 * 为什么优先 WebCodecs 而不是 MediaRecorder：
 *   - 不受实时速度限制（离线编码可以快于实时）；
 *   - 帧序、时间戳、码率全部可控；
 *   - 不会因为主线程卡顿丢帧。
 *
 * 容器封装交给 mp4-muxer / webm-muxer（均 MIT），不自己写容器。
 */
import { Muxer as Mp4Muxer, ArrayBufferTarget as Mp4Target } from 'mp4-muxer'
import { Muxer as WebmMuxer, ArrayBufferTarget as WebmTarget } from 'webm-muxer'
import { VideoCancelled } from './common'

export interface EncodeOptions {
  width: number
  height: number
  fps: number
  /** 码率（bps），不传则按分辨率估算 */
  bitrate?: number
  /** 外部取消 */
  signal?: AbortSignal
  /** 关键帧间隔（帧） */
  keyFrameInterval?: number
  /** 每完成一帧回调（用于进度） */
  onFrameEncoded?: (frame: number, total: number) => void
}

export interface EncodeResult {
  blob: Blob
  mime: string
  ext: string
}

/** 按分辨率估算一个合理的默认码率。 */
export function estimateBitrate(width: number, height: number, fps: number): number {
  // 经验值：约 0.1 bpp，下限 1 Mbps，上限 20 Mbps
  const raw = width * height * fps * 0.1
  return Math.round(Math.min(20_000_000, Math.max(1_000_000, raw)))
}

/** 浏览器实际支持的编码配置。 */
const CODEC_CANDIDATES = [
  // H.264（兼容性最好，Safari/Chrome 都支持）
  { container: 'mp4' as const, ext: 'mp4', mime: 'video/mp4', codec: 'avc1.42001f', muxerCodec: 'avc' as const },
  // VP9 / VP8 退路（WebM）
  { container: 'webm' as const, ext: 'webm', mime: 'video/webm', codec: 'vp09.00.10.08', muxerCodec: 'vp9' as const },
]

export interface SelectedCodec {
  container: 'mp4' | 'webm'
  ext: string
  mime: string
  codec: string
  muxerCodec: 'avc' | 'vp9'
}

/** 选出第一组浏览器支持的编码配置。 */
export async function selectCodec(width: number, height: number, fps: number): Promise<SelectedCodec | null> {
  if (typeof VideoEncoder === 'undefined') return null
  for (const c of CODEC_CANDIDATES) {
    try {
      const support = await VideoEncoder.isConfigSupported({
        codec: c.codec,
        width,
        height,
        bitrate: estimateBitrate(width, height, fps),
      })
      if (support.supported) return c
    } catch {
      // 继续尝试下一组
    }
  }
  return null
}

/**
 * 编码一组帧。
 *
 * @param getFrame 第 i 帧的画布（每次返回后由本函数负责释放）
 * @param totalFrames 总帧数
 */
export async function encodeVideo(
  codec: SelectedCodec,
  totalFrames: number,
  getFrame: (index: number) => OffscreenCanvas | Promise<OffscreenCanvas>,
  opts: EncodeOptions,
): Promise<EncodeResult> {
  const { width, height, fps, signal } = opts
  const bitrate = opts.bitrate ?? estimateBitrate(width, height, fps)
  const keyFrameInterval = opts.keyFrameInterval ?? Math.max(1, Math.round(fps * 2))

  const target =
    codec.container === 'mp4' ? new Mp4Target() : new WebmTarget()

  const muxer =
    codec.container === 'mp4'
      ? new Mp4Muxer({
          target: target as Mp4Target,
          video: { codec: 'avc', width, height, frameRate: fps },
          fastStart: 'in-memory',
        })
      : new WebmMuxer({
          target: target as WebmTarget,
          video: { codec: 'V_VP9', width, height, frameRate: fps },
        })

  let encodeError: Error | null = null

  const encoder = new VideoEncoder({
    output: (chunk, meta) => {
      try {
        muxer.addVideoChunk(chunk, meta)
      } catch (err) {
        encodeError = err as Error
      }
    },
    error: (err) => {
      encodeError = err
    },
  })

  encoder.configure({ codec: codec.codec, width, height, bitrate, framerate: fps })

  try {
    for (let i = 0; i < totalFrames; i++) {
      if (signal?.aborted) throw new VideoCancelled()
      if (encodeError) throw encodeError

      const canvas = await getFrame(i)
      // 时间戳用微秒，且必须单调递增
      const timestamp = Math.round((i * 1_000_000) / fps)
      const frame = new VideoFrame(canvas, { timestamp, duration: Math.round(1_000_000 / fps) })
      try {
        encoder.encode(frame, { keyFrame: i % keyFrameInterval === 0 })
      } finally {
        // 立刻释放，避免帧在内存里堆积（内存约束）
        frame.close()
      }

      // 编码队列过深时等一等，形成背压
      while (encoder.encodeQueueSize > 4) {
        await new Promise((r) => setTimeout(r, 1))
        if (signal?.aborted) throw new VideoCancelled()
      }
      opts.onFrameEncoded?.(i + 1, totalFrames)
    }

    await encoder.flush()
    muxer.finalize()
  } finally {
    try {
      encoder.close()
    } catch {
      // 已关闭时忽略
    }
  }

  const buffer = (target as { buffer: ArrayBuffer | null }).buffer
  if (!buffer) throw new Error('编码失败：未产生输出数据')

  return {
    blob: new Blob([buffer], { type: codec.mime }),
    mime: codec.mime,
    ext: codec.ext,
  }
}
