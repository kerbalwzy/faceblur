import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import type { FaceBox } from '@/engine/detector'
import {
  toFaceEntries,
  type FaceEntry,
  type RenderSettings,
} from '@/pipeline/image-pipeline'
import type { LoadedImage } from '@/pipeline/import-image'
import type { VideoInfo } from '@/pipeline/import-video'
import { releaseVideo } from '@/pipeline/import-video'

/** 单页工作流的状态机（specs/privacy-tool-ui）。 */
export type Stage =
  | 'idle' // 未选择素材
  | 'loading' // 加载引擎中
  | 'detecting' // 检测中
  | 'ready' // 可编辑
  | 'processing' // 视频处理中
  | 'rendering' // 导出中
  | 'done' // 完成
  | 'error'

export type MediaKind = 'image' | 'video'

export interface SessionError {
  message: string
  retryable: boolean
}

export const useSessionStore = defineStore('session', () => {
  const stage = ref<Stage>('idle')
  const error = ref<SessionError | null>(null)
  const kind = ref<MediaKind>('image')

  /** 图片素材（bitmap 不放进响应式系统，避免代理开销） */
  const image = shallowRef<LoadedImage | null>(null)
  /** 视频素材 */
  const video = shallowRef<VideoInfo | null>(null)

  const name = ref('')
  const faces = ref<FaceEntry[]>([])

  const settings = ref<RenderSettings>({
    style: 'blur',
    strength: 0.6,
    shape: 'rounded',
  })

  const loadProgress = ref(0)
  const loadStage = ref<'runtime' | 'model' | 'session'>('runtime')

  /** 视频处理进度 */
  const videoProgress = ref(0)
  const videoFrames = ref({ done: 0, total: 0 })
  /** 视频导出结果 */
  const resultBlob = ref<Blob | null>(null)
  const resultName = ref('')
  /** 是否走了降级的实时录制路径 */
  const degraded = ref(false)

  const showingOriginal = ref(false)

  const hasMedia = computed(() => image.value !== null || video.value !== null)
  const hasImage = computed(() => image.value !== null)
  const hasVideo = computed(() => video.value !== null)

  const faceCount = computed(() => faces.value.length)
  const enabledCount = computed(() => faces.value.filter((f) => f.enabled).length)

  const busy = computed(
    () =>
      stage.value === 'loading' ||
      stage.value === 'detecting' ||
      stage.value === 'processing' ||
      stage.value === 'rendering',
  )

  const canExport = computed(() => {
    if (kind.value === 'video') return stage.value === 'ready' && resultBlob.value !== null
    return stage.value === 'ready' || stage.value === 'done'
  })

  function reset(): void {
    image.value?.bitmap.close()
    image.value = null
    releaseVideo(video.value)
    video.value = null
    name.value = ''
    faces.value = []
    error.value = null
    stage.value = 'idle'
    kind.value = 'image'
    loadProgress.value = 0
    videoProgress.value = 0
    videoFrames.value = { done: 0, total: 0 }
    resultBlob.value = null
    resultName.value = ''
    degraded.value = false
  }

  function setImage(loaded: LoadedImage): void {
    image.value?.bitmap.close()
    releaseVideo(video.value)
    video.value = null
    kind.value = 'image'
    image.value = loaded
    name.value = loaded.name
    faces.value = []
    error.value = null
    resultBlob.value = null
    stage.value = 'detecting'
  }

  function setVideo(info: VideoInfo): void {
    image.value?.bitmap.close()
    image.value = null
    releaseVideo(video.value)
    kind.value = 'video'
    video.value = info
    name.value = info.name
    faces.value = []
    error.value = null
    resultBlob.value = null
    stage.value = 'ready'
  }

  function setFaces(list: FaceBox[]): void {
    faces.value = toFaceEntries(list)
  }

  function toggleFace(id: number): void {
    const target = faces.value.find((f) => f.id === id)
    if (target) target.enabled = !target.enabled
  }

  function setAllFaces(enabled: boolean): void {
    for (const f of faces.value) f.enabled = enabled
  }

  function fail(err: unknown, retryable = true): void {
    const message = err instanceof Error ? err.message : String(err)
    error.value = { message, retryable }
    stage.value = 'error'
  }

  return {
    stage,
    error,
    kind,
    image,
    video,
    name,
    faces,
    settings,
    loadProgress,
    loadStage,
    videoProgress,
    videoFrames,
    resultBlob,
    resultName,
    degraded,
    showingOriginal,
    hasMedia,
    hasImage,
    hasVideo,
    faceCount,
    enabledCount,
    busy,
    canExport,
    reset,
    setImage,
    setVideo,
    setFaces,
    toggleFace,
    setAllFaces,
    fail,
  }
})
