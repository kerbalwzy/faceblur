/**
 * 视频导入：格式校验、元信息读取、可解码性探测。
 *
 * 需求（specs/video-blur）：
 *   - 支持 MP4 / WebM / MOV；
 *   - 导入后展示时长、分辨率、预计帧数；
 *   - 浏览器无法解码（如某些 HEVC）时给出转码建议。
 */

export const SUPPORTED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'] as const

export type VideoErrorKind = 'unsupported-type' | 'decode-failed' | 'empty' | 'no-video-track'

export class VideoImportError extends Error {
  readonly kind: VideoErrorKind
  constructor(kind: VideoErrorKind, message: string) {
    super(message)
    this.name = 'VideoImportError'
    this.kind = kind
  }
}

export function isSupportedVideo(file: File): boolean {
  if ((SUPPORTED_VIDEO_TYPES as readonly string[]).includes(file.type)) return true
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (!file.type) return ['mp4', 'webm', 'mov', 'm4v'].includes(ext)
  return false
}

export interface VideoInfo {
  /** 时长（秒） */
  duration: number
  width: number
  height: number
  /** 估算帧数（按标称帧率；读不到时按 30fps 估） */
  estimatedFrames: number
  /** objectURL，使用方负责 revoke */
  url: string
  element: HTMLVideoElement
  name: string
  type: string
}

/** 读取视频元信息并验证可解码。 */
export async function importVideo(file: File): Promise<VideoInfo> {
  if (file.size === 0) throw new VideoImportError('empty', '文件为空')
  if (!isSupportedVideo(file)) {
    throw new VideoImportError(
      'unsupported-type',
      `不支持的视频格式：${file.type || file.name.split('.').pop() || '未知'}。请使用 MP4、WebM 或 MOV。`,
    )
  }

  const url = URL.createObjectURL(file)
  const video = document.createElement('video')
  video.preload = 'auto'
  video.muted = true
  video.playsInline = true
  video.src = url

  try {
    await waitForMetadata(video)
  } catch {
    URL.revokeObjectURL(url)
    throw new VideoImportError(
      'decode-failed',
      '当前浏览器无法解码该视频。可能是 HEVC 等不受支持的编码，建议先转码为 H.264 的 MP4。',
    )
  }

  if (!video.videoWidth || !video.videoHeight) {
    URL.revokeObjectURL(url)
    throw new VideoImportError('no-video-track', '该文件不包含视频轨道。')
  }

  const duration = Number.isFinite(video.duration) ? video.duration : 0
  // 浏览器不给帧率，用常见值估算；实际处理以解码出的帧为准
  const estimatedFrames = Math.max(1, Math.round(duration * 30))

  return {
    duration,
    width: video.videoWidth,
    height: video.videoHeight,
    estimatedFrames,
    url,
    element: video,
    name: file.name,
    type: file.type || 'video/mp4',
  }
}

function waitForMetadata(video: HTMLVideoElement): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      video.removeEventListener('loadedmetadata', onOk)
      video.removeEventListener('error', onErr)
      clearTimeout(timer)
    }
    const onOk = () => {
      cleanup()
      resolve()
    }
    const onErr = () => {
      cleanup()
      reject(new Error('decode error'))
    }
    // 某些损坏文件既不触发 loadedmetadata 也不触发 error
    const timer = setTimeout(onErr, 15_000)
    video.addEventListener('loadedmetadata', onOk)
    video.addEventListener('error', onErr)
  })
}

/** 释放视频资源。 */
export function releaseVideo(info: VideoInfo | null): void {
  if (!info) return
  info.element.pause()
  info.element.removeAttribute('src')
  info.element.load()
  URL.revokeObjectURL(info.url)
}

/** 是否支持基于 RequestVideoFrameCallback 的逐帧解码（Chrome/Safari 支持）。 */
export function hasVideoFrameCallback(): boolean {
  return typeof HTMLVideoElement !== 'undefined' && 'requestVideoFrameCallback' in HTMLVideoElement.prototype
}

/** 是否支持 WebCodecs（优先用于导出）。 */
export function hasWebCodecs(): boolean {
  return (
    typeof globalThis !== 'undefined' &&
    'VideoEncoder' in globalThis &&
    'VideoFrame' in globalThis
  )
}

/** 是否支持 MediaRecorder（降级路径）。 */
export function hasMediaRecorder(): boolean {
  return typeof MediaRecorder !== 'undefined'
}

export type VideoExportMode = 'webcodecs' | 'mediarecorder' | 'unsupported'

/** 选择导出路径。 */
export function pickExportMode(): VideoExportMode {
  if (hasWebCodecs()) return 'webcodecs'
  if (hasMediaRecorder()) return 'mediarecorder'
  return 'unsupported'
}

/** 给用户看的时长文本。 */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}
